// SOURCING: none — sets a default through Theia's WidgetManager and ViewContainer part API.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, ViewContainer, WidgetManager } from '@theia/core/lib/browser';
import { EXPLORER_VIEW_CONTAINER_ID } from '@theia/navigator/lib/browser/navigator-widget-factory';
import { OpenEditorsWidget } from '@theia/navigator/lib/browser/open-editors-widget/navigator-open-editors-widget';
import { TimelineWidget } from '@theia/timeline/lib/browser/timeline-widget';

/**
 * Zed's project panel is the file tree alone, so the explorer's Open Editors and Timeline views start
 * hidden, which also drops the tree's section header. Each is hidden when it is first added (Timeline
 * arrives once a timeline provider registers); a restored layout applies the user's own visibility after
 * its parts are added, and the Views menu brings them back.
 */
@injectable()
export class ZedExplorer implements FrontendApplicationContribution {

    @inject(WidgetManager)
    protected readonly widgetManager: WidgetManager;

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
            }
        });
    }
}
