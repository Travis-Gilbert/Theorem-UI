// SOURCING: @theia/filesystem FileSystemProvider with the Readonly capability is the seam
// (registered through FileServiceContribution, as the user storage provider is), so editors,
// DiffUris and OpenerService show a delegation's changes as they show the SCM's; the receipts
// come from Theorem's delegation routes through @theoremharness/sdk.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { DiffUris } from '@theia/core/lib/browser/diff-uris';
import { Disposable, Event } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileService, FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';
import {
    createFileSystemProviderError, FileSystemProviderCapabilities, FileSystemProviderErrorCode,
    FileSystemProviderWithFileReadWriteCapability, FileType, Stat
} from '@theia/filesystem/lib/common/files';
import { TheoremError, type Theorem } from '@theoremharness/sdk';
import type { DelegationChanges } from '../common/ide-bridge';
import { TheoremConnection } from './theorem-connection';

export const DELEGATION_SCHEME = 'theorem-delegation';

export type ChangeSide = 'before' | 'after';

export type DelegatedChange = Theorem.ChangeSetEntry;

/** One side of one change: `theorem-delegation:/<runId>/<delegationId>/<before|after>/<path>`. */
export function delegationUri(runId: string, delegationId: string, side: ChangeSide, path: string): URI {
    return URI.fromComponents({
        scheme: DELEGATION_SCHEME, authority: '', path: `/${runId}/${delegationId}/${side}/${path}`, query: '', fragment: '',
    });
}

function parse(uri: URI): { runId: string; delegationId: string; side: ChangeSide; path: string } | undefined {
    const [, runId, delegationId, side, ...rest] = uri.path.toString().split('/');
    if (uri.scheme !== DELEGATION_SCHEME || !runId || !delegationId || (side !== 'before' && side !== 'after') || !rest.length) {
        return undefined;
    }
    return { runId, delegationId, side, path: rest.join('/') };
}

const readonly = (uri: URI): Error =>
    createFileSystemProviderError(`${uri.path.toString()}: delegated changes are read-only`, FileSystemProviderErrorCode.NoPermissions);

const notFound = (uri: URI, why: string): Error =>
    createFileSystemProviderError(`${uri.path.toString()}: ${why}`, FileSystemProviderErrorCode.FileNotFound);

/**
 * The before and after content of the changes a delegation made in its
 * overlay. Refs name fixed bytes, so content never changes; a run's receipts
 * are read again each time its changes are opened, since a live delegation
 * keeps adding to them.
 */
@injectable()
export class TheoremDelegations implements FileSystemProviderWithFileReadWriteCapability, FileServiceContribution {

    readonly capabilities = FileSystemProviderCapabilities.FileReadWrite | FileSystemProviderCapabilities.Readonly
        | FileSystemProviderCapabilities.PathCaseSensitive;
    readonly onDidChangeCapabilities = Event.None;
    readonly onDidChangeFile = Event.None;
    readonly onFileWatchError = Event.None;

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;

    protected readonly receipts = new Map<string, Promise<Theorem.DelegationPart[]>>();

    registerFileSystemProviders(service: FileService): void {
        service.registerProvider(DELEGATION_SCHEME, this);
    }

    /** The run's delegations; `fresh` reads them again. */
    delegations(runId: string, fresh = false): Promise<Theorem.DelegationPart[]> {
        let receipts = this.receipts.get(runId);
        if (!receipts || fresh) {
            receipts = this.connection.client.chat.runs.delegations({ runId }).then(({ delegations }) => delegations);
            this.receipts.set(runId, receipts);
            receipts.catch(() => this.receipts.delete(runId));
        }
        return receipts;
    }

    /** A diff per change `target` names, or the one side that exists of an added or deleted file. */
    async targets({ runId, delegationId, path }: DelegationChanges): Promise<URI[]> {
        const delegation = (await this.delegations(runId, true)).find(d => d.delegationId === delegationId);
        const changes = (delegation?.receipt?.changes ?? []).filter(c => !c.binary && (path === undefined || c.path === path));
        return changes.map(change => {
            const side = (s: ChangeSide) => delegationUri(runId, delegationId, s, change.path);
            if (change.change === 'add') {
                return side('after');
            }
            if (change.change === 'delete') {
                return side('before');
            }
            const name = change.path.slice(change.path.lastIndexOf('/') + 1);
            return DiffUris.encode(side('before'), side('after'), `${name} (${delegation!.roleLabel})`);
        });
    }

    async stat(uri: URI): Promise<Stat> {
        if (!parse(uri)) {
            return { type: FileType.Directory, ctime: 0, mtime: 0, size: 0 };
        }
        const contents = await this.readFile(uri);
        return { type: FileType.File, ctime: 0, mtime: 0, size: contents.byteLength };
    }

    async readFile(uri: URI): Promise<Uint8Array> {
        const target = parse(uri);
        if (!target) {
            throw notFound(uri, 'not a delegated change');
        }
        const { runId, delegationId, side, path } = target;
        const delegation = (await this.delegations(runId)).find(d => d.delegationId === delegationId);
        const change = delegation?.receipt?.changes.find(c => c.path === path);
        const ref = side === 'before' ? change?.beforeRef : change?.afterRef;
        if (!ref) {
            throw notFound(uri, `the delegation has no ${side} content for this file`);
        }
        try {
            const content = await this.connection.client.chat.runs.delegationContent({ runId, delegationId, ref });
            return new Uint8Array(await content.arrayBuffer());
        } catch (error) {
            if (error instanceof TheoremError && error.statusCode === 404) {
                throw notFound(uri, 'this change is no longer stored');
            }
            throw createFileSystemProviderError(`${path}: reading the change failed (${error instanceof Error ? error.message : String(error)})`,
                FileSystemProviderErrorCode.Unknown);
        }
    }

    async readdir(): Promise<[string, FileType][]> {
        return [];
    }

    watch(): Disposable {
        return Disposable.NULL;
    }

    async writeFile(uri: URI): Promise<void> {
        throw readonly(uri);
    }

    async mkdir(uri: URI): Promise<void> {
        throw readonly(uri);
    }

    async delete(uri: URI): Promise<void> {
        throw readonly(uri);
    }

    async rename(uri: URI): Promise<void> {
        throw readonly(uri);
    }
}
