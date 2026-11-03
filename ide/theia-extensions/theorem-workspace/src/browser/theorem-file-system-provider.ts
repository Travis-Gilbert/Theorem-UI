// SOURCING: @theia/filesystem FileSystemProvider is the seam (the same one its OPFS provider
// fills in browser-only mode); every call maps to a generated workspace.files operation of
// @theoremharness/sdk, and writes to existing files go through the shared DocumentSession.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { Disposable, Emitter, Event, MessageService } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import {
    createFileSystemProviderError, FileChange, FileChangeType, FileDeleteOptions, FileOverwriteOptions, FilePermission,
    FileSystemProviderCapabilities, FileSystemProviderErrorCode, FileSystemProviderWithFileFolderCopyCapability,
    FileSystemProviderWithFileReadWriteCapability, FileType, FileWriteOptions, Stat, WatchOptions
} from '@theia/filesystem/lib/common/files';
import { childrenOf, type DirectoryListing } from './directory-listing';
import { TheoremConnection } from './theorem-connection';


interface FileStat {
    type: 'file' | 'directory' | 'missing';
    size?: number;
    mtime_ms?: number;
    readonly?: boolean;
}

interface FileContents {
    encoding: 'utf8' | 'base64';
    contents: string;
}

const changeTypes = { created: FileChangeType.ADDED, changed: FileChangeType.UPDATED, deleted: FileChangeType.DELETED };

const fileTypes: Record<string, FileType> = { directory: FileType.Directory, symlink: FileType.SymbolicLink };

function providerError(error: unknown, uri: URI): Error {
    const { statusCode: status, body } = error as { statusCode?: number; body?: { code?: unknown } };
    const message = `${uri.path.toString()}: ${error instanceof Error ? error.message : String(error)}`;
    // The host answers a missing path with 409 `not_found` on some routes.
    if (status === 404 || body?.code === 'not_found') {
        return createFileSystemProviderError(message, FileSystemProviderErrorCode.FileNotFound);
    }
    if (status === 409 && body?.code === 'already_exists') {
        return createFileSystemProviderError(message, FileSystemProviderErrorCode.FileExists);
    }
    if (status === 403) {
        return createFileSystemProviderError(message, FileSystemProviderErrorCode.NoPermissions);
    }
    return createFileSystemProviderError(message, FileSystemProviderErrorCode.Unknown);
}

function base64Of(bytes: Uint8Array): string {
    const parts: string[] = [];
    for (let at = 0; at < bytes.length; at += 0x8000) {
        parts.push(String.fromCharCode(...bytes.subarray(at, at + 0x8000)));
    }
    return btoa(parts.join(''));
}

/**
 * The `file` scheme over the Theorem workspace at `file:///<name>`. Change
 * events come from the live stream, so `watch` has nothing to start.
 */
@injectable()
export class TheoremFileSystemProvider implements FileSystemProviderWithFileReadWriteCapability, FileSystemProviderWithFileFolderCopyCapability {

    @inject(MessageService)
    protected readonly messages: MessageService;

    @inject(TheoremConnection)
    protected readonly connection: TheoremConnection;

    readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.FileFolderCopy | FileSystemProviderCapabilities.PathCaseSensitive;
    readonly onDidChangeCapabilities = Event.None;
    readonly onFileWatchError = Event.None;

    protected readonly onDidChangeFileEmitter = new Emitter<readonly FileChange[]>();
    readonly onDidChangeFile = this.onDidChangeFileEmitter.event;

    @postConstruct()
    protected init(): void {
        const { live } = this.connection;
        live.on('file.changed', ({ data }) => {
            if (data.path === '.') {
                this.onDidChangeFileEmitter.fire([{ resource: this.connection.root, type: FileChangeType.UPDATED }]);
                return;
            }
            this.onDidChangeFileEmitter.fire([{ resource: this.connection.toUri(data.path), type: changeTypes[data.change] }]);
        });
        live.onResync(() => {
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
        return {
            type: stat.type === 'directory' ? FileType.Directory : FileType.File,
            mtime,
            ctime: mtime,
            size: stat.size ?? 0,
            permissions: stat.readonly ? FilePermission.Readonly : undefined,
        };
    }

    async readdir(resource: URI): Promise<[string, FileType][]> {
        const path = this.connection.toPath(resource);
        if (path === undefined) {
            if (resource.path.isRoot) {
                return [[this.connection.root.path.base, FileType.Directory]];
            }
            throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileNotFound);
        }
        const listing = await this.call(resource, async headers =>
            (await this.connection.client.ide.workspace.filesList({ ...headers, body: { path } })) as DirectoryListing);
        return childrenOf(listing, path).map(({ name, kind }) => [name, fileTypes[kind] ?? FileType.File]);
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

    async copy(from: URI, to: URI, opts: FileOverwriteOptions): Promise<void> {
        const source = this.requirePath(from);
        const target = this.requirePath(to);
        await this.requireFileServices(from);
        if (await this.exists(to)) {
            if (!opts.overwrite) {
                throw createFileSystemProviderError(to.toString(), FileSystemProviderErrorCode.FileExists);
            }
            await this.delete(to, { recursive: true, useTrash: false });
        }
        await this.call(from, () => this.connection.operate('workspace.files.copy', { from: source, to: target }));
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
     * and open editors see the change as an edit. Bytes that are not text have
     * no document, so the host writes them as given.
     */
    async writeFile(resource: URI, content: Uint8Array, opts: FileWriteOptions): Promise<void> {
        const path = this.requirePath(resource);
        const exists = await this.exists(resource);
        if (!exists && !opts.create) {
            throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileNotFound);
        }
        if (exists && !opts.overwrite) {
            throw createFileSystemProviderError(resource.toString(), FileSystemProviderErrorCode.FileExists);
        }
        let text: string;
        try {
            text = new TextDecoder('utf-8', { fatal: true }).decode(content);
        } catch {
            await this.requireFileServices(resource);
            await this.call(resource, headers => this.connection.client.ide.workspace.filesCreate({
                ...headers,
                body: { path, contents: base64Of(content), encoding: 'base64' },
            }));
            return;
        }
        if (!exists) {
            await this.call(resource, headers =>
                this.connection.client.ide.workspace.filesCreate({ ...headers, body: { path, contents: text } }));
            return;
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

    /**
     * Copying and writing bytes arrived on the host together. An older host would
     * store the base64 as the file's text and has no copy to follow the deletion
     * of what a copy replaces, so they are refused before anything is touched.
     */
    protected async requireFileServices(resource: URI): Promise<void> {
        if (!await this.connection.offers('workspace.files.copy')) {
            const refusal = `This Theorem host cannot copy or write binary files: ${resource.path.base}`;
            this.messages.warn(refusal);
            throw createFileSystemProviderError(refusal, FileSystemProviderErrorCode.Unavailable);
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
