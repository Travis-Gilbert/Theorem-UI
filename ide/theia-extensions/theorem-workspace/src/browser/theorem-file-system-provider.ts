// SOURCING: @theia/filesystem FileSystemProvider is the seam (the same one its OPFS provider
// fills in browser-only mode); every call maps to a generated workspace.files operation of
// @theoremharness/sdk, and writes to existing files go through the shared DocumentSession.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, Emitter, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import {
    createFileSystemProviderError, FileChange, FileChangeType, FileDeleteOptions, FileOverwriteOptions,
    FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileSystemProviderWithFileReadWriteCapability,
    FileType, FileWriteOptions, Stat, WatchOptions
} from '@theia/filesystem/lib/common/files';
import { TheoremConnection } from './theorem-connection';

interface Listing {
    files: { path: string }[];
    directories?: { path: string }[];
}

interface FileStat {
    type: 'file' | 'directory' | 'missing';
    size?: number;
    mtime_ms?: number;
}

interface FileContents {
    encoding: 'utf8' | 'base64';
    contents: string;
}

const changeTypes = { created: FileChangeType.ADDED, changed: FileChangeType.UPDATED, deleted: FileChangeType.DELETED };

function parentOf(path: string): string {
    const slash = path.lastIndexOf('/');
    return slash === -1 ? '' : path.slice(0, slash);
}

function providerError(error: unknown, uri: URI): Error {
    const status = (error as { statusCode?: number }).statusCode;
    const message = `${uri.path.toString()}: ${error instanceof Error ? error.message : String(error)}`;
    if (status === 404) {
        return createFileSystemProviderError(message, FileSystemProviderErrorCode.FileNotFound);
    }
    if (status === 409) {
        return createFileSystemProviderError(message, FileSystemProviderErrorCode.FileExists);
    }
    if (status === 403) {
        return createFileSystemProviderError(message, FileSystemProviderErrorCode.NoPermissions);
    }
    return createFileSystemProviderError(message, FileSystemProviderErrorCode.Unknown);
}

/**
 * The `file` scheme over the Theorem workspace at `file:///<name>`. Change
 * events come from the live stream, so `watch` has nothing to start.
 */
@injectable()
export class TheoremFileSystemProvider implements FileSystemProviderWithFileReadWriteCapability {

    @inject(TheoremConnection)
    protected readonly connection: TheoremConnection;

    readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.PathCaseSensitive;
    readonly onDidChangeCapabilities = Event.None;
    readonly onFileWatchError = Event.None;

    protected readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    /** Children of every listed directory, cached until a file is created or deleted. */
    protected listing: Promise<Map<string, [string, FileType][]>> | undefined;

    @postConstruct()
    protected init(): void {
        const { live } = this.connection;
        live.on('file.changed', ({ data }) => {
            if (data.path === '.') {
                this.listing = undefined;
                this.onDidChangeFileEmitter.fire([{ resource: this.connection.root, type: FileChangeType.UPDATED }]);
                return;
            }
            if (data.change !== 'changed') {
                this.listing = undefined;
            }
            this.onDidChangeFileEmitter.fire([{ resource: this.connection.toUri(data.path), type: changeTypes[data.change] }]);
        });
        live.onResync(() => {
            this.listing = undefined;
            this.onDidChangeFileEmitter.fire([{ resource: this.connection.root, type: FileChangeType.UPDATED }]);
        });
    }

    watch(_resource: URI, _opts: WatchOptions): Disposable {
        return Disposable.NULL;
    }

    async stat(resource: URI): Promise<Stat> {
        const path = this.connection.toPath(resource);
        if (path === undefined) {
            if (resource.path.isRoot) {
                return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0 };
            }
            throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileNotFound);
        }
        if (path === '') {
            return { type: FileType.Directory, mtime: 0, ctime: 0, size: 0 };
        }
        const stat = await this.call(resource, async headers =>
            (await this.connection.client.ide.workspace.filesStat({ ...headers, body: { path } })) as FileStat);
        if (stat.type === 'missing') {
            throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileNotFound);
        }
        const mtime = stat.mtime_ms ?? 0;
        return { type: stat.type === 'directory' ? FileType.Directory : FileType.File, mtime, ctime: mtime, size: stat.size ?? 0 };
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        const path = this.connection.toPath(resource);
        if (path === undefined) {
            if (resource.path.isRoot) {
                return [[this.connection.root.path.base, FileType.Directory]];
            }
            throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileNotFound);
        }
        const children = (await this.list(resource)).get(path);
        if (!children) {
            throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileNotADirectory);
        }
        return children;
    }

    protected list(resource: URI): Promise<Map<string, [string, FileType][]>> {
        this.listing ??= this.call(resource, async headers => {
            const listing = (await this.connection.client.ide.workspace.filesList({ ...headers, body: {} })) as Listing;
            const children = new Map<string, [string, FileType][]>([['', []]]);
            for (const { path } of listing.directories ?? []) {
                children.set(path, children.get(path) ?? []);
            }
            const add = (path: string, type: FileType) => {
                const parent = parentOf(path);
                const siblings = children.get(parent) ?? [];
                children.set(parent, siblings);
                siblings.push([path.slice(parent ? parent.length + 1 : 0), type]);
            };
            listing.directories?.forEach(({ path }) => add(path, FileType.Directory));
            listing.files.forEach(({ path }) => add(path, FileType.File));
            return children;
        });
        this.listing.catch(() => this.listing = undefined);
        return this.listing;
    }

    async mkdir(resource: URI): Promise<void> {
        const path = this.requirePath(resource);
        await this.call(resource, headers =>
            this.connection.client.ide.workspace.filesCreate({ ...headers, body: { path, directory: true } }));
    }

    async delete(resource: URI, _opts: FileDeleteOptions): Promise<void> {
        const path = this.requirePath(resource);
        await this.call(resource, headers =>
            this.connection.client.ide.workspace.filesDelete({ ...headers, body: { path } }));
    }

    async rename(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        const source = this.requirePath(from);
        const target = this.requirePath(to);
        if (!opts.overwrite && await this.exists(to)) {
            throw createFileSystemProviderError(to.toString(), FileSystemProviderErrorCode.FileExists);
        }
        await this.call(from, headers =>
            this.connection.client.ide.workspace.filesRename({ ...headers, body: { from: source, to: target } }));
    }

    async readFile(resource: URI): Promise<Uint8Array> {
        const path = this.requirePath(resource);
        const file = await this.call(resource, async headers =>
            (await this.connection.client.ide.workspace.filesRead({ ...headers, body: { path } })) as FileContents);
        if (file.encoding === 'base64') {
            return Uint8Array.from(atob(file.contents), char => char.charCodeAt(0));
        }
        return new TextEncoder().encode(file.contents);
    }

    /**
     * A new file is created as given. An existing file is changed through its
     * shared document session and saved, so the authority stays the only writer
     * and open editors see the change as an edit.
     */
    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        const path = this.requirePath(resource);
        let text: string;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(content);
        } catch {
            throw createFileSystemProviderError(`${resource.path}: the workspace accepts text files only`, FileSystemProviderErrorCode.NoPermissions);
        }
        if (!await this.exists(resource)) {
            if (!opts.create) {
                throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileNotFound);
            }
            await this.call(resource, headers =>
                this.connection.client.ide.workspace.filesCreate({ ...headers, body: { path, contents: text } }));
            return;
        }
        if (!opts.overwrite) {
            throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileExists);
        }
        const lease = await this.connection.acquire(path);
        try {
            const change = replacement(lease.session.text, text);
            if (change) {
                lease.session.edit([change]);
            }
            await lease.session.save();
        } catch (error) {
            throw providerError(error, resource);
        } finally {
            lease.release();
        }
    }

    protected async exists(resource: URI): Promise<boolean> {
        try {
            await this.stat(resource);
            return true;
        } catch {
            return false;
        }
    }

    protected requirePath(resource: URI): string {
        const path = this.connection.toPath(resource);
        if (!path) {
            throw createFileSystemProviderError(`${resource.toString()} is outside the workspace`, FileSystemProviderErrorCode.NoPermissions);
        }
        return path;
    }

    protected async call<T>(resource: URI, request: (headers: Awaited<ReturnType<TheoremConnection['headers']>>) => Promise<T>): Promise<T> {
        try {
            return await request(await this.connection.headers());
        } catch (error) {
            throw providerError(error, resource);
        }
    }
}

/**
 * The single change turning `before` into `after`: the span between their
 * common prefix and suffix, kept off surrogate pairs.
 */
export function replacement(before: string, after: string): { start: number; end: number; insert: string } | undefined {
    if (before === after) {
        return undefined;
    }
    const limit = Math.min(before.length, after.length);
    let prefix = 0;
    while (prefix < limit && before.charCodeAt(prefix) === after.charCodeAt(prefix)) {
        prefix += 1;
    }
    if (prefix > 0 && isHighSurrogate(before.charCodeAt(prefix - 1))) {
        prefix -= 1;
    }
    let suffix = 0;
    while (suffix < limit - prefix && before.charCodeAt(before.length - 1 - suffix) === after.charCodeAt(after.length - 1 - suffix)) {
        suffix += 1;
    }
    if (suffix > 0 && isLowSurrogate(before.charCodeAt(before.length - suffix))) {
        suffix -= 1;
    }
    return { start: prefix, end: before.length - suffix, insert: after.slice(prefix, after.length - suffix) };
}

function isHighSurrogate(code: number): boolean {
    return code >= 0xd800 && code <= 0xdbff;
}

function isLowSurrogate(code: number): boolean {
    return code >= 0xdc00 && code <= 0xdfff;
}
