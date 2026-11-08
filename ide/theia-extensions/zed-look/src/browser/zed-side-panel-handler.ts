// SOURCING: @theia/core SidePanelHandler — subclassed through Theia's DI rebind.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { SidePanel, SidePanelHandler } from '@theia/core/lib/browser/shell/side-panel-handler';
import { BoxLayout, Panel } from '@theia/core/shared/@lumino/widgets';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser/navigator-widget-factory';

/**
 * Zed has no activity bar, so the side bar (tab strip and menus) is taken out of the layout, and views
 * are switched from the status bar instead (see `ZedDockButtons`). Detaching it rather than hiding it
 * matters: a hidden tab strip is still attached and measures itself at zero height, so every tab
 * overflows, and revealing one moves it to the front.
 *
 * Zed's project panel also has no title row, so the explorer's is hidden; its actions are in the
 * tree's context menu (see `ZedExplorer`). Other panels keep theirs, as Zed's git and debug panels do.
 *
 * A dock opens at least as wide as Zed's project panel. Theia sizes it as a share of the shell the
 * first time and then keeps that width, so a first boot in a narrow window left the explorer at about
 * 100px with every file name cut off. Dragging it narrower still works; it opens wide again next time.
 */
@injectable()
export class ZedSidePanelHandler extends SidePanelHandler {

    static readonly OPEN_WIDTH = 240;

    protected override getDefaultPanelSize(): number | undefined {
        const size = super.getDefaultPanelSize();
        return size === undefined ? undefined : Math.max(size, ZedSidePanelHandler.OPEN_WIDTH);
    }

    override setLayoutData(layoutData: SidePanel.LayoutData): void {
        const size = layoutData.size && Math.max(layoutData.size, ZedSidePanelHandler.OPEN_WIDTH);
        super.setLayoutData({ ...layoutData, size });
    }

    protected override createContainer(): Panel {
        const container = super.createContainer();
        const [sideBar] = (container.layout as BoxLayout).widgets;
        sideBar.parent = null;
        return container;
    }

    override refresh(): void {
        super.refresh();
        this.toolBar.setHidden(this.tabBar.currentTitle?.owner.id === EXPLORER_VIEW_CONTAINER_ID);
    }
}
