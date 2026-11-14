// SOURCING: none — bun:test over the transport's recovery from a restarted host
import { describe, expect, mock, test } from 'bun:test';
import { isolateResyncListeners, openUntilReady, reason, recoveringSend, type OpeningState, type Send } from './workspace-recovery';

const refusal = (status: number, body: unknown) => Response.json(body, { status });
const notOpen = () => refusal(404, { code: 'workspace_not_open' });
const behind = (current = 1) =>
    refusal(409, { code: 'stale_revision', detail: { base_revision: 5, current_revision: current, resource_id: 'a.ts' } });

const answering = (...answers: Response[]): Send & { calls: number } => {
    const send = (async () => {
        send.calls += 1;
        return answers.shift() ?? Response.json({ ok: true });
    }) as Send & { calls: number };
    send.calls = 0;
    return send;
};

const recovery = () => ({ reopen: mock(async () => undefined), seat: mock(async (_resource: string) => undefined) });

describe('recoveringSend', () => {
    test('passes an ordinary answer through untouched', async () => {
        const send = answering(refusal(404, { code: 'not_found' }));
        const steps = recovery();
        expect((await recoveringSend(send, steps)('/x')).status).toBe(404);
        expect(send.calls).toBe(1);
        expect(steps.reopen).not.toHaveBeenCalled();
    });

    test('reopens a workspace a restarted host has closed, and repeats the request', async () => {
        const send = answering(notOpen());
        const steps = recovery();
        expect((await recoveringSend(send, steps)('/x')).status).toBe(200);
        expect(send.calls).toBe(2);
        expect(steps.reopen).toHaveBeenCalledTimes(1);
    });

    test('reopens after the store rejects an expired CSRF token and reuses the request key', async () => {
        const steps = recovery();
        const headers = { 'Idempotency-Key': 'same-operation' };
        const seenKeys: Array<string | null> = [];
        const send: Send = async (_input, init) => {
            seenKeys.push(new Headers(init?.headers).get('Idempotency-Key'));
            return steps.reopen.mock.calls.length === 0
                ? refusal(403, { code: 'csrf_token_refused' })
                : Response.json({ ok: true });
        };
        const response = await recoveringSend(send, steps)('/operations/workspace.files.stat', { method: 'POST', headers });
        expect(response.status).toBe(200);
        expect(steps.reopen).toHaveBeenCalledTimes(1);
        expect(seenKeys).toEqual(['same-operation', 'same-operation']);
    });

    test('keeps a repeated CSRF refusal and an unrelated access refusal', async () => {
        const steps = recovery();
        const stale = () => refusal(403, { code: 'csrf_token_refused' });
        const send = answering(stale(), stale(), refusal(403, { code: 'environment_execution_not_granted' }));
        const recover = recoveringSend(send, steps);
        expect((await recover('/operation')).status).toBe(403);
        expect((await recover('/operation')).status).toBe(403);
        expect(send.calls).toBe(3);
        expect(steps.reopen).toHaveBeenCalledTimes(1);
    });

    test('seats a document whose authority is behind, and repeats the edit', async () => {
        const send = answering(behind());
        const steps = recovery();
        expect((await recoveringSend(send, steps)('/x')).status).toBe(200);
        expect(steps.seat.mock.calls[0]?.[0]).toBe('a.ts');
    });

    test('an authority still behind is refused under a code the SDK will not resend', async () => {
        const send = answering(behind(), behind());
        const answer = await recoveringSend(send, recovery())('/x');
        expect(answer.status).toBe(409);
        expect(((await answer.json()) as { code: string }).code).toBe('authority_behind');
        expect(send.calls).toBe(2);
    });

    test('a stale edit the session can catch up from is left to the SDK', async () => {
        const send = answering(refusal(409, { code: 'stale_revision', detail: { base_revision: 1, current_revision: 5, resource_id: 'a.ts' } }));
        const steps = recovery();
        expect(((await (await recoveringSend(send, steps)('/x')).json()) as { code: string }).code).toBe('stale_revision');
        expect(steps.seat).not.toHaveBeenCalled();
    });
});

describe('isolateResyncListeners', () => {
    test('a listener that throws is reported, and the stream reader does not see it', async () => {
        const listeners: ((resync: number) => void | Promise<void>)[] = [];
        const live = {
            onResync(listener: (resync: number) => void | Promise<void>) {
                listeners.push(listener);
                return () => undefined;
            },
        };
        const failed = mock((_error: unknown) => undefined);
        isolateResyncListeners(live, failed);
        live.onResync(() => {
            throw new Error('shell died');
        });
        await expect(Promise.resolve(listeners[0]?.(1))).resolves.toBeUndefined();
        expect(failed).toHaveBeenCalledTimes(1);
    });
});

describe('openUntilReady', () => {
    const failing = (times: number) => {
        const attempt = mock(async () => {
            if (attempt.mock.calls.length <= times) {
                throw new Error(`refused ${attempt.mock.calls.length}`);
            }
        });
        return attempt;
    };

    test('tries again after each failure and resolves once one succeeds', async () => {
        const states: OpeningState[] = [];
        const attempt = failing(2);
        await openUntilReady(attempt, state => states.push(state), [1, 2]).ready;
        expect(attempt).toHaveBeenCalledTimes(3);
        expect(states).toEqual([
            { state: 'opening' },
            { state: 'failed', error: 'refused 1', retryInMs: 1 },
            { state: 'opening' },
            { state: 'failed', error: 'refused 2', retryInMs: 2 },
            { state: 'opening' },
            { state: 'open' },
        ]);
    });

    test('retryNow cuts the wait short', async () => {
        const attempt = failing(1);
        let opened = false;
        const opening = openUntilReady(attempt, () => undefined, [60_000]);
        void opening.ready.then(() => (opened = true));
        await Bun.sleep(5);
        expect(opened).toBe(false);
        opening.retryNow();
        await opening.ready;
        expect(attempt).toHaveBeenCalledTimes(2);
    });
});

describe('reason', () => {
    test("reads a problem body's detail, then its title, instead of the SDK's dump", () => {
        const failure = (body: unknown) => Object.assign(new Error('ServiceUnavailableError Status code: 503 Body: {...}'), { body });
        expect(reason(failure({ title: 'The Theorem environment is unavailable', detail: 'The host is restarting' }))).toBe('The host is restarting');
        expect(reason(failure({ title: 'The Theorem environment is unavailable' }))).toBe('The Theorem environment is unavailable');
        expect(reason(failure('<html>bad gateway</html>'))).toBe('ServiceUnavailableError Status code: 503 Body: {...}');
        expect(reason(new TypeError('Failed to fetch'))).toBe('Failed to fetch');
    });
});
