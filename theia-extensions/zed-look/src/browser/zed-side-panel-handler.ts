// SOURCING: @theia/core SidePanelHandler — subclassed through Theia's DI rebind.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { SidePanelHandler } from '@theia/core/lib/browser/shell/side-panel-handler';
import { BoxLayout, Panel } from '@theia/core/shared/@lumino/widgets';

/**
 * Zed has no activity bar. Hiding the side bar (tab strip and menus) through Lumino, rather than CSS,
 * also removes it from the layout, so a collapsed dock takes no width. Views are switched from the
 * status bar instead (see `ZedDockButtons`).
 */
@injectable()
export class ZedSidePanelHandler extends SidePanelHandler {

    protected override createContainer(): Panel {
        const container = super.createContainer();
        const [sideBar] = (container.layout as BoxLayout).widgets;
        sideBar.hide();
        return container;
    }
}
