// SOURCING: @theia/core SidePanelHandler — subclassed through Theia's DI rebind.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { SidePanelHandler } from '@theia/core/lib/browser/shell/side-panel-handler';
import { BoxLayout, Panel } from '@theia/core/shared/@lumino/widgets';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser/navigator-widget-factory';

/**
 * Zed has no activity bar. Hiding the side bar (tab strip and menus) through Lumino, rather than CSS,
 * also removes it from the layout, so a collapsed dock takes no width. Views are switched from the
 * status bar instead (see `ZedDockButtons`).
 *
 * Zed's project panel also has no title row, so the explorer's is hidden; its actions are in the
 * tree's context menu (see `ZedExplorer`). Other panels keep theirs, as Zed's git and debug panels do.
 */
@injectable()
export class ZedSidePanelHandler extends SidePanelHandler {

    protected override createContainer(): Panel {
        const container = super.createContainer();
        const [sideBar] = (container.layout as BoxLayout).widgets;
        sideBar.hide();
        return container;
    }

    override refresh(): void {
        super.refresh();
        this.toolBar.setHidden(this.tabBar.currentTitle?.owner.id === EXPLORER_VIEW_CONTAINER_ID);
    }
}
