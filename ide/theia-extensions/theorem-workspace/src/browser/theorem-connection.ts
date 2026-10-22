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
import { DocumentSession, TheoremClient, WorkspaceLanguage, WorkspaceLive, WorkspaceScm } from '@theoremharness/sdk';

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

    readonly client = new TheoremClient({ baseUrl: window.location.origin, auth: false });
    readonly workspaceId: string;
    /** `file:///<name>`: the workspace root as Theia shows it. */
    readonly root: URI;
    readonly live: WorkspaceLive;
    /** Resolves once the workspace is open and the live stream has started. */
    readonly ready: Promise<void>;

    protected csrfToken = '';
    protected readonly documents = new Map<string, { session: Promise<DocumentSession>; refs: number }>();
    protected languageCalls: Promise<WorkspaceLanguage> | undefined;
    protected scmCalls: Promise<WorkspaceScm> | undefined;

    constructor() {
        const params = new URLSearchParams(window.location.search);
        this.workspaceId = params.get('workspace') ?? 'local';
        this.root = new URI('file:///').resolve(params.get('name') ?? this.workspaceId);
        this.live = new WorkspaceLive({ client: this.client, workspaceId: this.workspaceId });
        this.ready = this.open();
    }

    protected async open(): Promise<void> {
        const { csrfToken } = await this.client.environment.bootstrap();
        this.csrfToken = csrfToken;
        await this.client.remoteWorkspaces.open({
            'X-CSRF-Token': csrfToken,
            'Idempotency-Key': crypto.randomUUID(),
            workspace_id: this.workspaceId,
        });
        void this.live.start();
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
