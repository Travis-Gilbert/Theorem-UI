// SOURCING: @theia/timeline is the view, @theia/core DiffUris and OpenerService open comparisons, and the
// host's `scm.log` and `history.*` hold the entries. Only the mapping between them is written here.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, OpenerService, open } from '@theia/core/lib/browser';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { Command, CommandContribution, CommandRegistry, Emitter, MenuContribution, MenuModelRegistry, MessageService } from '@theia/core/lib/common';
import { Resource, ResourceError, ResourceResolver } from '@theia/core/lib/common/resource';
import URI from '@theia/core/lib/common/uri';
import { TIMELINE_ITEM_CONTEXT_MENU } from '@theia/timeline/lib/browser/timeline-tree-widget';
import { TimelineService } from '@theia/timeline/lib/browser/timeline-service';
import type { Timeline, TimelineChangeEvent, TimelineItem } from '@theia/timeline/lib/common/timeline-model';
import type { URI as CodeUri } from '@theia/core/shared/vscode-uri';
import { TheoremConnection } from './theorem-connection';
import { revisionUri } from './theorem-scm';

const PROVIDER_ID = 'theorem-timeline';
const HISTORY_SCHEME = 'theorem-history';
const LOCAL_CONTEXT = 'theorem-local-history';
/** Newest revisions shown from the host's journal, which has one for every sent edit. */
const LOCAL_LIMIT = 50;
const COMMIT_LIMIT = 100;

const OPEN_COMMIT: Command = { id: 'theorem.timeline.openCommit' };
const OPEN_REVISION: Command = { id: 'theorem.timeline.openRevision' };
const RESTORE_REVISION: Command = { id: 'theorem.timeline.restoreRevision', label: 'Restore This Revision' };

interface CommitEntry { author: string; commit: string; subject: string; timestamp: string }
interface HistoryEntry { operation_id: string; revision: number }

/** A file's text at one point in the host's journal of edits. */
@injectable()
export class TheoremHistoryResolver implements ResourceResolver {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;

    async resolve(uri: URI): Promise<Resource> {
        if (uri.scheme !== HISTORY_SCHEME) {
            throw new Error(`Not a ${HISTORY_SCHEME} URI: ${uri}`);
        }
        const { point, path } = JSON.parse(uri.query) as { point: string; path: string };
        return {
            uri,
            readOnly: true,
            readContents: async () => {
                const { text } = await this.connection.operate<{ text?: string | null }>('history.preview', { point, resource_id: path });
                if (typeof text !== 'string') {
                    throw ResourceError.NotFound({ message: `${path} has no text at ${point}`, data: { uri } });
                }
                return text;
            },
            dispose: () => undefined,
        };
    }
}

/**
 * The Timeline view: the edits this host session journaled for the file, then
 * its commits. One provider serves both because the view shows only the source
 * that answered last, and the journal has no timestamps to sort them by, which
 * is also why its entries are named by revision.
 */
@injectable()
export class TheoremTimeline implements FrontendApplicationContribution, CommandContribution, MenuContribution {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(TimelineService) protected readonly timeline: TimelineService;
    @inject(OpenerService) protected readonly openers: OpenerService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected readonly onDidChangeEmitter = new Emitter<TimelineChangeEvent>();

    onStart(): void {
        this.timeline.registerTimelineProvider({
            id: PROVIDER_ID,
            label: 'File History',
            scheme: 'file',
            onDidChange: this.onDidChangeEmitter.event,
            provideTimeline: uri => this.provide(uri),
            dispose: () => undefined,
        });
        this.connection.ready.then(() => {
            const changed = () => this.onDidChangeEmitter.fire({ id: PROVIDER_ID, uri: undefined, reset: true });
            this.connection.live.on('document.saved', changed);
            this.connection.live.onResync(changed);
        }, () => undefined);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(OPEN_COMMIT, { execute: (uri: string, commit: string) => this.openCommit(new URI(uri), commit) });
        registry.registerCommand(OPEN_REVISION, { execute: (uri: string, point: string, label: string) => this.openRevision(new URI(uri), point, label) });
        registry.registerCommand(RESTORE_REVISION, {
            execute: (item: TimelineItem) => this.restore(new URI(item.uri), item.handle),
            isVisible: (item?: TimelineItem) => item?.contextValue === LOCAL_CONTEXT,
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(TIMELINE_ITEM_CONTEXT_MENU, {
            commandId: RESTORE_REVISION.id,
            when: `timelineItem == ${LOCAL_CONTEXT}`,
        });
    }

    protected async provide(codeUri: CodeUri): Promise<Timeline | undefined> {
        const uri = new URI(codeUri.toString());
        const path = this.connection.toPath(uri);
        if (!path) {
            return undefined;
        }
        const [local, commits] = await Promise.all([this.localItems(uri, path), this.commitItems(uri, path)]);
        return { source: PROVIDER_ID, items: [...local, ...commits] };
    }

    /** A file the journal has not seen has no entries; the journal refuses nothing else worth showing. */
    protected async localItems(uri: URI, path: string): Promise<TimelineItem[]> {
        let entries: HistoryEntry[];
        try {
            ({ entries } = await this.connection.operate<{ entries: HistoryEntry[] }>('history.list', { resource_id: path }));
        } catch {
            return [];
        }
        const points = new Map<string, HistoryEntry>();
        for (const entry of entries) {
            points.set(entry.operation_id, entry);
        }
        return [...points.values()].sort((a, b) => b.revision - a.revision).slice(0, LOCAL_LIMIT).map(({ operation_id, revision }) => {
            const label = `Revision ${revision}`;
            return {
                source: PROVIDER_ID,
                id: `local:${operation_id}`,
                uri: uri.toString(),
                handle: operation_id,
                timestamp: revision,
                label,
                description: 'Local',
                contextValue: LOCAL_CONTEXT,
                command: { id: OPEN_REVISION.id, title: label, arguments: [uri.toString(), operation_id, label] },
            };
        });
    }

    /** A file outside git, or a checkout without it, has no commits. */
    protected async commitItems(uri: URI, path: string): Promise<TimelineItem[]> {
        let commits: CommitEntry[];
        try {
            ({ commits } = await this.connection.operate<{ commits: CommitEntry[] }>('scm.log', { path, limit: COMMIT_LIMIT }));
        } catch {
            return [];
        }
        return commits.map(({ author, commit, subject, timestamp }) => ({
            source: PROVIDER_ID,
            id: `commit:${commit}`,
            uri: uri.toString(),
            handle: commit,
            timestamp: Number(timestamp) * 1000,
            label: subject,
            description: author,
            tooltip: `${commit.slice(0, 10)}  ${author}\n${new Date(Number(timestamp) * 1000).toLocaleString()}\n\n${subject}`,
            command: { id: OPEN_COMMIT.id, title: subject, arguments: [uri.toString(), commit] },
        }));
    }

    /** What the commit changed in the file; the commit that added it has no earlier side to compare. */
    protected async openCommit(uri: URI, commit: string): Promise<void> {
        const after = revisionUri(uri, commit);
        const before = revisionUri(uri, `${commit}~1`);
        const path = this.connection.toPath(uri)!;
        const existed = await this.connection.scm()
            .then(scm => scm.show(path, `${commit}~1`))
            .then(shown => shown.exists, () => false);
        await open(this.openers, existed ? DiffUris.encode(before, after, `${uri.path.base} (${commit.slice(0, 7)})`) : after);
    }

    protected async openRevision(uri: URI, point: string, label: string): Promise<void> {
        const path = this.connection.toPath(uri)!;
        const at = uri.withScheme(HISTORY_SCHEME).withQuery(JSON.stringify({ point, path }));
        await open(this.openers, DiffUris.encode(at, uri, `${uri.path.base} (${label} ↔ Now)`));
    }

    /** Reaches every editor as a new revision. Undo reverts a client's own edits, so what it replaced stays reachable as the revision before it. */
    protected async restore(uri: URI, point: string): Promise<void> {
        const path = this.connection.toPath(uri);
        if (!path) {
            return;
        }
        try {
            const lease = await this.connection.acquire(path);
            try {
                await lease.session.flushed();
                await this.connection.operate('history.restore', { point, resource_id: path, workspace_id: this.connection.workspaceId });
            } finally {
                lease.release();
            }
        } catch (error) {
            this.messages.error(`Restoring the revision failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }
}
