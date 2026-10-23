// SOURCING: @theia/core BrowserMenuBarContribution and @theia/scm ScmContribution — subclassed through Theia's DI rebind.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, StatusBarEntry } from '@theia/core/lib/browser';
import { BrowserMainMenuFactory, BrowserMenuBarContribution } from '@theia/core/lib/browser/menu/browser-menu-plugin';
import { ScmContribution } from '@theia/scm/lib/browser/scm-contribution';
import { ZedTitleBar } from './zed-title-bar';

/** Puts Zed's title bar in the top panel in place of Theia's logo and menu bar. */
@injectable()
export class ZedTitleBarContribution extends BrowserMenuBarContribution {

    @inject(ZedTitleBar)
    protected readonly titleBar: ZedTitleBar;

    constructor(@inject(BrowserMainMenuFactory) factory: BrowserMainMenuFactory) {
        super(factory);
    }

    protected override appendMenu(shell: ApplicationShell): void {
        shell.addWidget(this.titleBar, { area: 'top' });
    }
}

/** Leaves the repository's first status bar command, the branch, to the title bar. */
@injectable()
export class ZedScmContribution extends ScmContribution {

    protected override setStatusBarEntry(id: string, entry: StatusBarEntry): void {
        if (id !== 'scm.status.0') {
            super.setStatusBarEntry(id, entry);
        }
    }
}
