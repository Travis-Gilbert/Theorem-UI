// SOURCING: none — bun:test over the transport's recovery from a restarted host
import { describe, expect, mock, test } from 'bun:test';
import { isolateResyncListeners, recoveringSend, type Send } from './workspace-recovery';

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
