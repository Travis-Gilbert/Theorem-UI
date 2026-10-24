// SOURCING: @theia/workspace BrowserOnlyWorkspaceServer, @theia/userstorage
// UserStorageContribution, @theia/filesystem OPFSFileSystemProvider and
// DelegatingFileSystemProvider; the overrides only choose which root and which store.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { MaybePromise } from '@theia/core/lib/common';
import { EnvVariable, EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { FileService, FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';
import { OPFSFileSystemProvider } from '@theia/filesystem/lib/browser-only/opfs-filesystem-provider';
import { DelegatingFileSystemProvider } from '@theia/filesystem/lib/common/delegating-file-system-provider';
import { FileSystemProvider } from '@theia/filesystem/lib/common/files';
import { UserStorageContribution } from '@theia/userstorage/lib/browser/user-storage-contribution';
import { BrowserOnlyWorkspaceServer } from '@theia/workspace/lib/browser-only/browser-only-workspace-server';
import { TheoremConnection } from './theorem-connection';

/**
 * Theia's own state (settings, keymaps, plugin storage, workspace metadata)
 * stays in the browser under this scheme, so none of it is written into the
 * workspace checkout that `file` now names.
 */
export const THEIA_USER_SCHEME = 'theia-user';

export const theoremEnvVariablesServer: EnvVariablesServer = {
    getExecPath: async (): Promise<string> => '',
    getVariables: async (): Promise<EnvVariable[]> => [],
    getValue: async (): Promise<EnvVariable | undefined> => undefined,
    getConfigDirUri: async (): Promise<string> => `${THEIA_USER_SCHEME}:///.theia`,
    getHomeDirUri: async (): Promise<string> => 'file:///',
    getDrives: async (): Promise<string[]> => [],
};

/** Theia's browser storage (OPFS), addressed as `theia-user:` instead of `file:`. */
@injectable()
export class TheiaUserStorageProviderContribution implements FileServiceContribution {

    @inject(OPFSFileSystemProvider) protected readonly opfs: OPFSFileSystemProvider;

    registerFileSystemProviders(service: FileService): void {
        service.registerProvider(THEIA_USER_SCHEME, new DelegatingFileSystemProvider(this.opfs, {
            uriConverter: {
                to: resource => resource.withScheme('file'),
                from: resource => resource.withScheme(THEIA_USER_SCHEME),
            },
        }));
    }
}

@injectable()
export class TheoremUserStorageContribution extends UserStorageContribution {

    protected override getDelegate(service: FileService): MaybePromise<FileSystemProvider> {
        return service.activateProvider(THEIA_USER_SCHEME);
    }
}

/** The frame always opens the Theorem workspace it was given. */
@injectable()
export class TheoremWorkspaceServer extends BrowserOnlyWorkspaceServer {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;

    override async getMostRecentlyUsedWorkspace(): Promise<string | undefined> {
        return this.connection.root.toString();
    }

    override async getRecentWorkspaces(): Promise<string[]> {
        return [this.connection.root.toString()];
    }
}
