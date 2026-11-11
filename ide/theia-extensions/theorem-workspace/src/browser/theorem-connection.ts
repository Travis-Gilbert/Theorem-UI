// SOURCING: @theoremharness/sdk — TheoremClient carries every request, WorkspaceLive the
// live stream, DocumentSession shared editing, WorkspaceLanguage and WorkspaceScm the typed
// language and git calls; this file only holds one instance of each for the frame and
// shares document sessions between the editor and the file system.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import URI from '@theia/core/lib/common/uri';
import { DocumentSession, TheoremClient, TheoremError, WorkspaceLanguage, WorkspaceLive, WorkspaceScm } from '@theoremharness/sdk';
import { workspacePathOf } from './host-paths';
import { isolateResyncListeners, recoveringSend, type Send } from './workspace-recovery';

/** Headers every workspace operation carries. */
export interface OperationHeaders {
    workspaceId: string;
    'X-CSRF-Token': string;
    'Idempotency-Key': string;
}

/** A shared document session held until `release` is called. */
export interface DocumentLease {
    readonly session: DocumentSession;
    release(): void;
}

/**
 * The frame's attachment to one Theorem workspace. The Theorem UI serves this
 * frame at `/theia/?workspace=<id>&name=<label>`, so requests go to the same
 * origin and carry the session cookie; the token stays on the UI's server.
 */
@injectable()
export class TheoremConnection {

    readonly client: TheoremClient;
    /** The same transport without recovery: what recovery itself sends cannot wait on recovery. */
    protected readonly direct: TheoremClient;
    readonly workspaceId: string;
    /** `file:///<name>`: the workspace root as Theia shows it. */
    readonly root: URI;
    readonly live: WorkspaceLive;
    /** Resolves once the workspace is open and the live stream has started. */
    readonly ready: Promise<void>;

    protected csrfToken = '';
    protected reopening: Promise<void> | undefined;
    protected readonly documents = new Map<string, { session: Promise<DocumentSession>; refs: number }>();
    protected languageCalls: Promise<WorkspaceLanguage> | undefined;
    protected scmCalls: Promise<WorkspaceScm> | undefined;
    protected hostRoots: Promise<string[]> | undefined;
    protected hostOperations: Promise<Set<string>> | undefined;

    constructor() {
        const params = new URLSearchParams(window.location.search);
        const send: Send = (input, init) => fetch(input, this.withCurrentToken(init));
        const baseUrl = window.location.origin;
        this.direct = new TheoremClient({ baseUrl, auth: false, fetch: send as typeof fetch });
        this.client = new TheoremClient({
            baseUrl,
            auth: false,
            fetch: recoveringSend(send, { reopen: () => this.reopen(), seat: resourceId => this.seat(resourceId) }) as typeof fetch,
        });
        this.workspaceId = params.get('workspace') ?? 'local';
        this.root = new URI('file:///').resolve(params.get('name') ?? this.workspaceId);
        this.live = new WorkspaceLive({ client: this.client, workspaceId: this.workspaceId });
        isolateResyncListeners(this.live, error => console.warn('A live consumer could not re-read after a resync', error));
        this.ready = this.open();
    }

    protected async open(): Promise<void> {
        await this.attach();
        void this.live.start();
    }

    /** Bootstrap, then ask the host to open the workspace: idempotent, so also how it is reopened. */
    protected async attach(): Promise<void> {
        const { csrfToken } = await this.direct.environment.bootstrap();
        this.csrfToken = csrfToken;
        await this.direct.remoteWorkspaces.open({
            'X-CSRF-Token': csrfToken,
            'Idempotency-Key': crypto.randomUUID(),
            workspace_id: this.workspaceId,
        });
    }

    /** One reopening for every request that found the workspace closed. */
    protected reopen(): Promise<void> {
        return this.reopening ??= this.attach()
            .then(() => Promise.allSettled([...this.documents.keys()].map(path => this.seat(path))))
            .then(() => undefined)
            .finally(() => this.reopening = undefined);
    }

    protected seat(resourceId: string): Promise<unknown> {
        return this.direct.documentSessions.open({
            workspaceId: this.workspaceId,
            'X-CSRF-Token': this.csrfToken,
            'Idempotency-Key': crypto.randomUUID(),
            resource_id: resourceId,
        });
    }

    /** A reopen's CSRF token replaces the one long-lived sessions captured. */
    protected withCurrentToken(init: RequestInit | undefined): RequestInit | undefined {
        if (!init?.headers || !this.csrfToken) {
            return init;
        }
        const headers = new Headers(init.headers);
        if (headers.has('X-CSRF-Token')) {
            headers.set('X-CSRF-Token', this.csrfToken);
        }
        return { ...init, headers };
    }

    /**
     * An operation the vendored SDK's typed wrappers do not cover, sent the way its generated methods send one:
     * through the same transport, and a refusal thrown as the error they throw.
     */
    async operate<T>(name: string, body: Record<string, unknown>): Promise<T> {
        const { workspaceId, ...headers } = await this.headers();
        const response = await this.client.fetch(
            `api/environment/v1/workspaces/${encodeURIComponent(workspaceId)}/operations/${name}`,
            { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body) }
        );
        const text = await response.text();
        let parsed: unknown = text;
        try {
            parsed = text === '' ? undefined : JSON.parse(text);
        } catch {
            // Not JSON: the refusal carries the text.
        }
        if (!response.ok) {
            throw new TheoremError({ statusCode: response.status, body: parsed, message: `${name}: HTTP ${response.status}` });
        }
        return parsed as T;
    }

    /** Whether this host offers an operation, for what hosts older than it cannot do. */
    async offers(name: string): Promise<boolean> {
        const operations = await (this.hostOperations ??= this.client.fetch('api/environment/v1/operations', { method: 'GET' })
            .then(async response => {
                if (!response.ok) {
                    throw new TheoremError({ statusCode: response.status, body: await response.text(), message: `operations: HTTP ${response.status}` });
                }
                return new Set(((await response.json()) as { operations: string[] }).operations);
            })
            .catch(error => { this.hostOperations = undefined; throw error; }));
        return operations.has(name);
    }

    /** What this workspace's host can run now, including which terminal backends are ready. */
    async capabilities(): Promise<unknown> {
        const { workspaceId } = await this.headers();
        const response = await this.client.fetch(
            `api/environment/v1/workspaces/${encodeURIComponent(workspaceId)}/capabilities`,
            { method: 'GET' }
        );
        if (!response.ok) {
            throw new TheoremError({ statusCode: response.status, body: await response.text(), message: `capabilities: HTTP ${response.status}` });
        }
        return response.json();
    }

    async headers(): Promise<OperationHeaders> {
        await this.ready;
        return {
            workspaceId: this.workspaceId,
            'X-CSRF-Token': this.csrfToken,
            'Idempotency-Key': crypto.randomUUID(),
        };
    }

    async channelOptions(): Promise<{ client: TheoremClient; live: WorkspaceLive; workspaceId: string; csrfToken: string }> {
        await this.ready;
        return { client: this.client, live: this.live, workspaceId: this.workspaceId, csrfToken: this.csrfToken };
    }

    /** Language features of the workspace's documents. */
    language(): Promise<WorkspaceLanguage> {
        return this.languageCalls ??= this.channelOptions().then(options => new WorkspaceLanguage(options));
    }

    /** Git on the workspace's checkout. */
    scm(): Promise<WorkspaceScm> {
        return this.scmCalls ??= this.channelOptions().then(options => new WorkspaceScm(options));
    }

    /** The workspace path of `uri`: `''` for the root, undefined outside it. */
    toPath(uri: URI): string | undefined {
        if (uri.scheme !== this.root.scheme) {
            return undefined;
        }
        return this.root.relative(uri)?.toString();
    }

    toUri(path: string): URI {
        return path === '' || path === '.' ? this.root : this.root.resolve(path);
    }

    /**
     * The frame's URI for one a language server named a file by, undefined beyond the workspace.
     * `resourceId` is any document the host can read: it describes its roots along with that document.
     */
    async fromHostUri(raw: string, resourceId: string): Promise<URI | undefined> {
        const roots = await (this.hostRoots ??= this.operate<{ roots: { path: string }[] }>('workspace.describe', { resource_id: resourceId })
            .then(({ roots }) => roots.map(root => root.path))
            .catch(error => {
                this.hostRoots = undefined;
                throw error;
            }));
        const path = workspacePathOf(raw, roots);
        if (path !== undefined) {
            return this.toUri(path);
        }
        const asGiven = new URI(raw);
        return this.toPath(asGiven) !== undefined ? asGiven : undefined;
    }

    /** One session per path, shared by every editor and writer in this frame. */
    async acquire(path: string): Promise<DocumentLease> {
        let entry = this.documents.get(path);
        if (!entry) {
            const session = this.channelOptions().then(options => DocumentSession.open({ ...options, resourceId: path }));
            entry = { session, refs: 0 };
            this.documents.set(path, entry);
            session.catch(() => this.documents.delete(path));
        }
        entry.refs += 1;
        const held = entry;
        const session = await held.session;
        let released = false;
        return {
            session,
            release: () => {
                if (released) {
                    return;
                }
                released = true;
                held.refs -= 1;
                if (held.refs === 0 && this.documents.get(path) === held) {
                    this.documents.delete(path);
                    session.dispose();
                }
            },
        };
    }
}
