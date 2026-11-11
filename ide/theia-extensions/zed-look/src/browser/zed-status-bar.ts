// SOURCING: @theia/core StatusBarImpl — subclassed through Theia's DI rebind.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable, postConstruct } from '@theia/core/shared/inversify';
import { StatusBarImpl } from '@theia/core/lib/browser/status-bar';
import { EMBEDDED } from './zed-embedded';

/** Embedded, the page draws the status bar's entries, so the frame's own stays out of the layout. */
@injectable()
export class ZedStatusBar extends StatusBarImpl {

    @postConstruct()
    protected hideWhenEmbedded(): void {
        if (EMBEDDED) {
            this.setHidden(true);
        }
    }

    protected override updateVisibility(): void {
        if (EMBEDDED) {
            this.setHidden(true);
        } else {
            super.updateVisibility();
        }
    }
}
