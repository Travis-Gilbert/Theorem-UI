// SOURCING: hand-roll — Theia has no status-bar dock switcher; this binds its own ApplicationShell side panels and StatusBar entries.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell, FrontendApplicationContribution, StatusBar, StatusBarAlignment } from '@theia/core/lib/browser';
import { SidePanelHandler } from '@theia/core/lib/browser/shell/side-panel-handler';
import { Title, Widget } from '@theia/core/shared/@lumino/widgets';
import { TerminalCommands } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { nls } from '@theia/core/lib/common/nls';

type DockSide = 'left' | 'right';

/**
 * Zed has no activity bar: each dock's panels are toggled from icon buttons at the ends of the status bar.
 * This mirrors the views of Theia's left and right side panels (whose side bars `ZedSidePanelHandler`
 * hides) into status bar buttons, left dock on the left and right dock plus the terminal on the right.
 */
@injectable()
export class ZedDockButtons implements FrontendApplicationContribution {

    @inject(ApplicationShell)
    protected readonly shell: ApplicationShell;

    @inject(StatusBar)
    protected readonly statusBar: StatusBar;

    protected readonly entryIds = new Set<string>();

    onStart(): void {
        const update = () => this.update();
        for (const side of ['left', 'right'] as const) {
            const { tabBar } = this.handler(side);
            tabBar.currentChanged.connect(update);
            tabBar.tabAdded.connect(update);
            tabBar.tabMoved.connect(update);
        }
        this.shell.onDidAddWidget(update);
        this.shell.onDidRemoveWidget(update);
        const toggleTerminal = nls.localizeByDefault('Toggle Terminal');
        this.statusBar.setElement('zed-dock.terminal', {
            text: '$(terminal)',
            className: 'zed-dock-button',
            tooltip: toggleTerminal,
            accessibilityInformation: { label: toggleTerminal, role: 'button' },
            alignment: StatusBarAlignment.RIGHT,
            priority: -10000,
            command: TerminalCommands.TOGGLE_TERMINAL.id
        });
        update();
    }

    protected update(): void {
        const stale = new Set(this.entryIds);
        for (const side of ['left', 'right'] as const) {
            const { tabBar } = this.handler(side);
            tabBar.titles.forEach((title, index) => {
                const id = `zed-dock.${side}.${title.owner.id}`;
                stale.delete(id);
                this.entryIds.add(id);
                const active = tabBar.currentTitle === title;
                // Codicons render through the status bar's `$(name)` syntax; other icon classes go on the entry itself.
                const codicon = /\bcodicon-([\w-]+)/.exec(title.iconClass)?.[1];
                this.statusBar.setElement(id, {
                    text: codicon ? `$(${codicon})` : '',
                    className: `zed-dock-button${codicon ? '' : ' ' + title.iconClass}${active ? ' zed-dock-button-active' : ''}`,
                    tooltip: title.caption || title.label,
                    accessibilityInformation: { label: title.label, role: 'button' },
                    alignment: side === 'left' ? StatusBarAlignment.LEFT : StatusBarAlignment.RIGHT,
                    // Left buttons lead the status bar; right buttons trail it, before the terminal button.
                    priority: side === 'left' ? 10000 - index : -9000 - index,
                    onclick: () => this.toggle(side, title)
                });
            });
        }
        for (const id of stale) {
            this.entryIds.delete(id);
            this.statusBar.removeElement(id);
        }
    }

    protected toggle(side: DockSide, title: Title<Widget>): void {
        if (this.handler(side).tabBar.currentTitle === title) {
            this.shell.collapsePanel(side);
        } else {
            this.shell.activateWidget(title.owner.id);
        }
    }

    protected handler(side: DockSide): SidePanelHandler {
        return side === 'left' ? this.shell.leftPanelHandler : this.shell.rightPanelHandler;
    }
}
