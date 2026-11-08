// SOURCING: none — request handling around @theoremharness/sdk's transport for answers only this
// host gives: the SDK has no recovery from a host that restarted, and takes a 404 on its live
// stream as final. Keep this file free of Theia imports so its tests run outside the workbench.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export type Send = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

/** The host's refusal of a request for a workspace it has not opened since it started. */
async function isNotOpen(response: Response): Promise<boolean> {
    if (response.status !== 404) {
        return false;
    }
    try {
        return (await response.clone().json() as { code?: unknown }).code === 'workspace_not_open';
    } catch {
        return false;
    }
}

interface StaleRevision {
    code?: unknown;
    detail?: { base_revision?: unknown; current_revision?: unknown; resource_id?: unknown };
}

/**
 * A refused edit saying the authority holds an older revision than the session that sent it. A
 * stale edit normally means the session is behind and reads what it missed; here there is nothing
 * to read, so the SDK would send the same edit again without end. A host that restarted answers
 * this for a document it has not seated again.
 */
async function authorityBehind(response: Response): Promise<{ resource: string; body: StaleRevision } | undefined> {
    if (response.status !== 409) {
        return undefined;
    }
    try {
        const body = await response.clone().json() as StaleRevision;
        const { base_revision: base, current_revision: current, resource_id: resource } = body.detail ?? {};
        const behind = body.code === 'stale_revision' && typeof base === 'number' && typeof current === 'number' && current < base;
        return behind && typeof resource === 'string' ? { resource, body } : undefined;
    } catch {
        return undefined;
    }
}

export interface WorkspaceRecovery {
    /** Open the workspace again and seat its open documents. Every caller may share one attempt. */
    reopen(): Promise<void>;
    /** Ask the host to seat one document again from the authority's head. */
    seat(resourceId: string): Promise<unknown>;
}

/**
 * Sends a request, recovering once from a restarted host: reopen the workspace when it says it is
 * not open, and seat a document again when its authority is behind. SDK requests carry an
 * `Idempotency-Key`, so repeating one is safe. An authority still behind afterwards is answered
 * under a code the SDK does not take as "catch up", so the session drops the edit and says so.
 */
export function recoveringSend(send: Send, recovery: WorkspaceRecovery): Send {
    return async (input, init) => {
        let response = await send(input, init);
        if (await isNotOpen(response)) {
            await recovery.reopen();
            response = await send(input, init);
        }
        const behind = await authorityBehind(response);
        if (!behind) {
            return response;
        }
        await recovery.seat(behind.resource);
        const again = await send(input, init);
        const still = await authorityBehind(again);
        return still ? Response.json({ ...still.body, code: 'authority_behind' }, { status: 409 }) : again;
    };
}

/**
 * Keeps one failing consumer from holding the live stream. The SDK awaits every resync listener
 * inside the loop that reads the stream and takes a rejection as the stream failing, so it
 * reconnects at the same cursor, gets the same resync, and never delivers another event. A terminal
 * whose shell died with the host does exactly that.
 */
export function isolateResyncListeners<R>(
    live: { onResync(listener: (resync: R) => void | Promise<void>): () => void },
    failed: (error: unknown) => void
): void {
    const register = live.onResync.bind(live);
    live.onResync = (listener: (resync: R) => void | Promise<void>) => register(async (resync: R) => {
        try {
            await listener(resync);
        } catch (error) {
            failed(error);
        }
    });
}

/** How opening the workspace stands: trying, open, or failed and waiting `retryInMs` to try again. */
export type OpeningState =
    | { state: 'opening' }
    | { state: 'open' }
    | { state: 'failed'; error: string; retryInMs: number };

export interface Opening {
    /** Resolves once an attempt succeeds; it never rejects, since every call needs the workspace open. */
    readonly ready: Promise<void>;
    /** Try again now instead of waiting out the delay. */
    retryNow(): void;
}

/** The waits between failed attempts; the last repeats. */
export const RETRY_DELAYS = [1000, 2000, 4000, 8000, 15000, 30000];

/**
 * What went wrong, in words a person can read: a problem body's detail or title, as the Theorem UI
 * describes its own errors, rather than the SDK's dump of the status and raw body.
 */
export function reason(error: unknown): string {
    const body = error && typeof error === 'object' && 'body' in error ? error.body : undefined;
    const field = (name: string) => {
        const value = body && typeof body === 'object' ? (body as Record<string, unknown>)[name] : undefined;
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
    };
    return field('detail') ?? field('title') ?? (error instanceof Error ? error.message : String(error));
}

/**
 * Opens the workspace, trying again after each failure, so a host that is still starting or briefly
 * unreachable recovers without a reload. Every request waits on the same `ready`, and the person can
 * cut a wait short.
 */
export function openUntilReady(attempt: () => Promise<void>, report: (state: OpeningState) => void, delays = RETRY_DELAYS): Opening {
    let wake: (() => void) | undefined;
    const ready = (async () => {
        for (let failures = 0; ; failures += 1) {
            report({ state: 'opening' });
            try {
                await attempt();
                report({ state: 'open' });
                return;
            } catch (error) {
                const retryInMs = delays[Math.min(failures, delays.length - 1)];
                report({ state: 'failed', error: reason(error), retryInMs });
                await new Promise<void>(resolve => {
                    const timer = setTimeout(resolve, retryInMs);
                    wake = () => {
                        clearTimeout(timer);
                        resolve();
                    };
                });
                wake = undefined;
            }
        }
    })();
    return { ready, retryNow: () => wake?.() };
}
