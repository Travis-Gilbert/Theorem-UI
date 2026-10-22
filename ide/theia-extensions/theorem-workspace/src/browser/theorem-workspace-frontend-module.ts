// SOURCING: none — Inversify container module rebinding Theia's browser-only seams to Theorem.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/stone.css';

import { ContainerModule, interfaces } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, KeybindingContribution } from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { TabBarToolbarContribution } from '@theia/core/lib/browser/shell/tab-bar-toolbar';
import { CommandContribution, MenuContribution } from '@theia/core/lib/common';
import { EnvVariablesServer } from '@theia/core/lib/common/env-variables';
import { ResourceResolver } from '@theia/core/lib/common/resource';
import { FileServiceContribution } from '@theia/filesystem/lib/browser/file-service';
import { FileSystemProvider } from '@theia/filesystem/lib/common/files';
import { MonacoEditorModelFactory } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { TerminalWidget } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalFrontendContribution } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { UserStorageContribution } from '@theia/userstorage/lib/browser/user-storage-contribution';
import { WorkspaceServer } from '@theia/workspace/lib/common';
import { TheoremConnection } from './theorem-connection';
import { TheoremDiagnostics } from './theorem-diagnostics';
import { TheoremEditorModelFactory } from './theorem-editor-model';
import { TheoremIdeBridge } from './theorem-ide-bridge';
import { TheoremFileSystemProvider } from './theorem-file-system-provider';
import { TheoremLanguageFeatures } from './theorem-language-features';
import { TheoremScmContribution, TheoremScmResourceResolver } from './theorem-scm';
import { TheoremStoneTheme } from './theorem-stone-theme';
import { TheoremTerminalFrontendContribution, TheoremTerminalWidget } from './theorem-terminal';
import {
    TheiaUserStorageProviderContribution, TheoremUserStorageContribution, TheoremWorkspaceServer, theoremEnvVariablesServer
} from './theorem-workspace-environment';

export default new ContainerModule((bind, _unbind, isBound, rebind) => {
    const bindOrRebind = <T>(id: interfaces.ServiceIdentifier<T>) => isBound(id) ? rebind(id) : bind(id);

    bind(TheoremConnection).toSelf().inSingletonScope();

    bind(TheoremFileSystemProvider).toSelf().inSingletonScope();
    bindOrRebind(FileSystemProvider).toService(TheoremFileSystemProvider);
    bindOrRebind(EnvVariablesServer).toConstantValue(theoremEnvVariablesServer);
    bind(TheiaUserStorageProviderContribution).toSelf().inSingletonScope();
    bind(FileServiceContribution).toService(TheiaUserStorageProviderContribution);
    bindOrRebind(UserStorageContribution).to(TheoremUserStorageContribution).inSingletonScope();

    bind(TheoremWorkspaceServer).toSelf().inSingletonScope();
    bindOrRebind(WorkspaceServer).toService(TheoremWorkspaceServer);

    bind(TheoremEditorModelFactory).toSelf().inSingletonScope();
    bind(MonacoEditorModelFactory).toService(TheoremEditorModelFactory);

    bindOrRebind(TerminalWidget).to(TheoremTerminalWidget).inTransientScope();
    bindOrRebind(TerminalFrontendContribution).to(TheoremTerminalFrontendContribution).inSingletonScope();

    bind(TheoremIdeBridge).toSelf().inSingletonScope();
    for (const contribution of [FrontendApplicationContribution, CommandContribution, MenuContribution, KeybindingContribution]) {
        bind(contribution).toService(TheoremIdeBridge);
    }

    bind(TheoremLanguageFeatures).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TheoremLanguageFeatures);
    bind(CommandContribution).toService(TheoremLanguageFeatures);
    bind(TheoremDiagnostics).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TheoremDiagnostics);

    bind(TheoremScmResourceResolver).toSelf().inSingletonScope();
    bind(ResourceResolver).toService(TheoremScmResourceResolver);
    bind(TheoremScmContribution).toSelf().inSingletonScope();
    for (const contribution of [
        FrontendApplicationContribution, CommandContribution, MenuContribution, TabBarToolbarContribution, ColorContribution
    ]) {
        bind(contribution).toService(TheoremScmContribution);
    }

    bind(TheoremStoneTheme).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(TheoremStoneTheme);
    bind(ColorContribution).toService(TheoremStoneTheme);
});
