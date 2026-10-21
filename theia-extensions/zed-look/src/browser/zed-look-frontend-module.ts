// SOURCING: none — Inversify container module wiring the contributions below.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import '../../src/browser/style/index.css';

import { ContainerModule } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { SidePanelHandler } from '@theia/core/lib/browser/shell/side-panel-handler';
import { ZedDockButtons } from './zed-dock-buttons';
import { ZedSidePanelHandler } from './zed-side-panel-handler';
import { ZedThemeContribution } from './zed-theme-contribution';

export default new ContainerModule((bind, unbind, isBound, rebind) => {
    rebind(SidePanelHandler).to(ZedSidePanelHandler);
    bind(ZedThemeContribution).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ZedThemeContribution);
    bind(ZedDockButtons).toSelf().inSingletonScope();
    bind(FrontendApplicationContribution).toService(ZedDockButtons);
});
