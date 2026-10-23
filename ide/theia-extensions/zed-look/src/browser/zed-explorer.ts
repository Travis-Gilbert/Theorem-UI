// SOURCING: none — sets defaults through Theia's WidgetManager, ViewContainer part API and MenuModelRegistry.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, ViewContainer, WidgetManager } from '@theia/core/lib/browser';
import { MenuContribution, MenuModelRegistry, nls } from '@theia/core/lib/common';
import { FileNavigatorCommands, NavigatorContextMenu, NAVIGATOR_CONTEXT_MENU } from '@theia/navigator/lib/browser/navigator-contribution';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser/navigator-widget-factory';
import { OpenEditorsWidget } from '@theia/navigator/lib/browser/open-editors-widget/navigator-open-editors-widget';
import { TimelineWidget } from '@theia/timeline/lib/browser/timeline-widget';

const VIEWS_SUBMENU = [...NAVIGATOR_CONTEXT_MENU, '8_views'];

/**
 * Zed's project panel is the file tree alone, with no title row (`ZedSidePanelHandler` hides it).
 *
 * The explorer's Open Editors and Timeline views start hidden, which also drops the tree's section
 * header. Each is hidden when it is first added (Timeline arrives once a timeline provider registers);
 * a restored layout applies the user's own visibility after its parts are added.
 *
 * The title row's actions move to the tree's context menu, which already has New File, New Folder and
 * Collapse All: Refresh Explorer, and a Views submenu linking the container's own view toggles.
 */
@injectable()
export class ZedExplorer implements FrontendApplicationContribution, MenuContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

    @inject(MenuModelRegistry)
    protected readonly menus: MenuModelRegistry;

    initialize(): void {
        this.widgetManager.onDidCreateWidget(({ widget }) => {
            if (widget instanceof ViewContainer && widget.id === EXPLORER_VIEW_CONTAINER_ID) {
                const toHide = new Set([OpenEditorsWidget.ID, TimelineWidget.ID]);
                const hide = () => widget.getParts()
                    .filter(part => toHide.delete(part.wrapped.id))
                    .forEach(part => part.setHidden(true));
                hide();
                // The container disposes this emitter, and its listeners, with itself.
                widget.onDidChangeTrackableWidgets(hide);
                // The container registers its view toggles in the '1_widgets' group of its context menu.
                const link = this.menus.linkCompoundMenuNode({
                    newParentPath: VIEWS_SUBMENU,
                    submenuPath: [`${EXPLORER_VIEW_CONTAINER_ID}-context-menu`, '1_widgets']
                });
                widget.disposed.connect(() => link.dispose());
            }
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(NavigatorContextMenu.MODIFICATION, {
            commandId: FileNavigatorCommands.REFRESH_NAVIGATOR.id,
            label: nls.localizeByDefault('Refresh Explorer'),
            order: 'z3'
        });
        menus.registerSubmenu(VIEWS_SUBMENU, nls.localizeByDefault('Views'));
    }
}
