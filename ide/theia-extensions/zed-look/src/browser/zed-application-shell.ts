// SOURCING: @theia/core ApplicationShell — subclassed through Theia's DI rebind.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser';
import { EMBEDDED } from './zed-embedded';

/**
 * Embedded, the top panel has nothing to hold (zed-title-bar-contribution.ts leaves the title to the page),
 * so it stays hidden whatever `window.menuBarVisibility` says, and the editors' tabs start at the frame's top.
 */
@injectable()
export class ZedApplicationShell extends ApplicationShell {

    protected override setTopPanelVisibility(preference: string): void {
        super.setTopPanelVisibility(EMBEDDED ? 'hidden' : preference);
    }
}
