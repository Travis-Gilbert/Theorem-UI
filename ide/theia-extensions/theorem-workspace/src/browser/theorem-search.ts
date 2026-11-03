// SOURCING: @theia/search-in-workspace SearchInWorkspaceServer and @theia/file-search
// FileSearchServiceImpl are the seams Theia's own browser-only modules fill; the workspace host's
// `search.query`, `search.cancel` and `workspace.files.list` do the searching, with ripgrep's engine
// over the checkout and open documents' unsaved text. Theia's fuzzy ranking and pattern matching
// stay Theia's.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CancellationToken, ILogger, URI } from '@theia/core';
import { FileSearchServiceImpl } from '@theia/file-search/lib/browser-only/file-search-service-impl';
import { FileSearchService } from '@theia/file-search/lib/common/file-search-service';
import { matchesPattern } from '@theia/filesystem/lib/browser-only/file-search';
import {
    SearchInWorkspaceClient, SearchInWorkspaceOptions, SearchInWorkspaceServer
} from '@theia/search-in-workspace/lib/common/search-in-workspace-interface';
import { matchesByPath, QueryAnswer } from './search-rows';
import { TheoremConnection } from './theorem-connection';

/** Files the host scans per call; a cancel is seen between calls. */
const FILES_PER_CALL = 200;

/** Find in Files over the workspace host. */
@injectable()
export class TheoremSearchServer implements SearchInWorkspaceServer {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(ILogger) protected readonly logger: ILogger;

    protected client: SearchInWorkspaceClient | undefined;
    protected nextId = 0;
    protected readonly running = new Map<number, { cancelled: boolean }>();

    setClient(client: SearchInWorkspaceClient | undefined): void {
        this.client = client;
    }

    async search(what: string, rootUris: string[], options: SearchInWorkspaceOptions = {}): Promise<number> {
        const id = ++this.nextId;
        const run = { cancelled: false };
        this.running.set(id, run);
        this.run(id, run, what, rootUris, options).then(
            () => this.client?.onDone(id),
            error => this.client?.onDone(id, error instanceof Error ? error.message : String(error))
        ).finally(() => this.running.delete(id));
        return id;
    }

    async cancel(searchId: number): Promise<void> {
        const run = this.running.get(searchId);
        if (run) {
            run.cancelled = true;
        }
    }

    dispose(): void {
        this.running.forEach(run => run.cancelled = true);
    }

    protected async query(body: Record<string, unknown>): Promise<QueryAnswer> {
        return await this.connection.client.ide.search.query({ ...await this.connection.headers(), body }) as QueryAnswer;
    }

    protected async run(id: number, run: { cancelled: boolean }, what: string, rootUris: string[], options: SearchInWorkspaceOptions): Promise<void> {
        const root = this.connection.root.toString();
        if (!what || (rootUris.length > 0 && !rootUris.some(uri => this.connection.toPath(new URI(uri)) !== undefined))) {
            return;
        }
        const scopes = rootUris.map(uri => this.connection.toPath(new URI(uri))).filter((path): path is string => !!path);
        const inScope = (path: string) => scopes.length === 0 || scopes.some(scope => path === scope || path.startsWith(`${scope}/`));
        let room = options.maxResults ?? Number.POSITIVE_INFINITY;
        let answer = await this.query({
            query: what,
            view: 'text',
            regex: !!options.useRegExp,
            case_sensitive: !!options.matchCase,
            whole_word: !!options.matchWholeWord,
            include: options.include ?? [],
            exclude: options.exclude ?? [],
            limit: FILES_PER_CALL,
        });
        for (; ;) {
            for (const [path, matches] of matchesByPath(answer.results)) {
                if (!inScope(path) || room <= 0) {
                    continue;
                }
                const kept = matches.slice(0, room);
                room -= kept.length;
                this.client?.onResult(id, { root, fileUri: this.connection.toUri(path).toString(), matches: kept });
            }
            if (answer.complete || answer.cancelled || run.cancelled || room <= 0) {
                break;
            }
            answer = await this.query({ id: answer.id, limit: FILES_PER_CALL });
        }
        if (!answer.complete) {
            void this.connection.headers()
                .then(headers => this.connection.client.ide.search.cancel({ ...headers, body: { id: answer.id } }))
                .catch(error => this.logger.debug(`search.cancel ${answer.id} failed`, error));
        }
    }
}

interface Listing {
    files: { path: string; ignored?: boolean }[];
}

/**
 * Quick Open over the host's listing rather than a walk from the browser. The listing leaves out the
 * host's excludes (`.git`, `node_modules`, `target`, `dist`) and marks what git ignores. It is kept
 * until a file is created or deleted, since Quick Open asks on every keystroke.
 */
@injectable()
export class TheoremFileSearchService extends FileSearchServiceImpl {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;

    protected listing: Promise<Listing> | undefined;

    @postConstruct()
    protected init(): void {
        const { live } = this.connection;
        live.on('file.changed', ({ data }) => {
            if (data.change !== 'changed') {
                this.listing = undefined;
            }
        });
        live.onResync(() => {
            this.listing = undefined;
        });
    }

    protected list(): Promise<Listing> {
        this.listing ??= this.connection.headers()
            .then(headers => this.connection.client.ide.workspace.filesList({ ...headers, body: {} }) as Promise<Listing>);
        this.listing.catch(() => this.listing = undefined);
        return this.listing;
    }

    protected override async doFind(rootUri: URI, options: FileSearchService.BaseOptions, accept: (fileUri: string) => void, token: CancellationToken): Promise<void> {
        const scope = this.connection.toPath(rootUri);
        if (scope === undefined) {
            return;
        }
        const matching = { dot: true, matchBase: true, nocase: true };
        const { files } = await this.list();
        for (const { path, ignored } of files) {
            if (token.isCancellationRequested) {
                return;
            }
            if ((options.useGitIgnore && ignored) || (scope && path !== scope && !path.startsWith(`${scope}/`))) {
                continue;
            }
            const uri = this.connection.toUri(path);
            const full = uri.path.toString();
            if (options.excludePatterns?.length && matchesPattern(full, options.excludePatterns, matching)) {
                continue;
            }
            if (!options.includePatterns?.length || matchesPattern(full, options.includePatterns, matching)) {
                accept(uri.toString());
            }
        }
    }
}
