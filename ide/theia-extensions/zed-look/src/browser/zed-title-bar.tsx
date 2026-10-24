// SOURCING: hand-roll — Theia has no title bar with project and branch buttons; this is a ReactWidget over its own
// ContextMenuRenderer (the main menu, as Theia's compact menu renders it), WorkspaceService and ScmService.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import * as React from '@theia/core/shared/react';
import { inject, injectable, postConstruct } from '@theia/core/shared/inversify';
import { CommandService, MAIN_MENU_BAR, nls } from '@theia/core/lib/common';
import { codicon, ContextMenuRenderer, ReactWidget } from '@theia/core/lib/browser';
import { ContextKeyService } from '@theia/core/lib/browser/context-key-service';
import { HoverService } from '@theia/core/lib/browser/hover-service';
import { LabelIcon, LabelParser } from '@theia/core/lib/browser/label-parser';
import { WorkspaceService } from '@theia/workspace/lib/browser/workspace-service';
import { WorkspaceCommands } from '@theia/workspace/lib/browser/workspace-commands';
import { ScmService } from '@theia/scm/lib/browser/scm-service';
import { ScmCommand } from '@theia/scm/lib/browser/scm-provider';

/**
 * Zed's title bar: an application menu button holding the main menu, the project name, which opens the
 * recent projects, and the current branch, which opens the branch picker. The branch button is the
 * selected repository's first status bar command (git's "Checkout to..."), which `ZedScmContribution`
 * leaves out of the status bar.
 */
@injectable()
export class ZedTitleBar extends ReactWidget {

    static readonly ID = 'zed-title-bar';

    @inject(ContextMenuRenderer)
    protected readonly contextMenuRenderer: ContextMenuRenderer;

    @inject(ContextKeyService)
    protected readonly contextKeyService: ContextKeyService;

    @inject(CommandService)
    protected readonly commands: CommandService;

    @inject(HoverService)
    protected readonly hoverService: HoverService;

    @inject(LabelParser)
    protected readonly labelParser: LabelParser;

    @inject(WorkspaceService)
    protected readonly workspaceService: WorkspaceService;

    @inject(ScmService)
    protected readonly scmService: ScmService;

    @postConstruct()
    protected init(): void {
        this.id = ZedTitleBar.ID;
        this.addClass(ZedTitleBar.ID);
        this.toDispose.pushAll([
            this.workspaceService.onWorkspaceChanged(() => this.update()),
            this.scmService.onDidChangeStatusBarCommands(() => this.update())
        ]);
        this.update();
    }

    protected render(): React.ReactNode {
        const workspace = this.workspaceService.workspace;
        // A folder is named by its directory, a multi-root workspace by its file without the extension.
        const project = workspace && (workspace.isDirectory ? workspace.resource.path.base : workspace.resource.path.name);
        const [branch] = this.scmService.statusBarCommands;
        return <>
            <button
                className={`zed-title-bar-button zed-title-bar-icon ${codicon('menu')}`}
                aria-label={nls.localizeByDefault('Application Menu')}
                onMouseEnter={this.hover(nls.localizeByDefault('Application Menu'))}
                onClick={this.openApplicationMenu} />
            <button
                className={`zed-title-bar-button${project ? '' : ' zed-title-bar-muted'}`}
                onMouseEnter={this.hover(nls.localize('theorem/zedLook/recentProjects', 'Recent Projects'))}
                onClick={() => this.commands.executeCommand(WorkspaceCommands.OPEN_RECENT_WORKSPACE.id)}>
                <span className='zed-title-bar-label'>{project ?? nls.localize('theorem/zedLook/openRecentProject', 'Open Recent Project')}</span>
            </button>
            {branch && <button
                className='zed-title-bar-button zed-title-bar-muted'
                onMouseEnter={this.hover(branch.tooltip ?? branch.title)}
                onClick={() => this.run(branch)}>
                {this.renderLabel(branch.title)}
            </button>}
        </>;
    }

    /** Renders `$(icon)` label syntax the way the status bar does. */
    protected renderLabel(text: string): React.ReactNode[] {
        return this.labelParser.parse(text).map((part, index) => LabelIcon.is(part)
            ? <span key={index} className={`zed-title-bar-label-icon ${part.name.startsWith('codicon-') ? `codicon ${part.name}` : codicon(part.name)}`} />
            : part.trim() && <span key={index} className='zed-title-bar-label'>{part.trim()}</span>);
    }

    protected hover(content: string): (event: React.MouseEvent<HTMLElement>) => void {
        return event => this.hoverService.requestHover({ content, target: event.currentTarget, position: 'bottom' });
    }

    protected readonly openApplicationMenu = (event: React.MouseEvent<HTMLElement>): void => {
        const button = event.currentTarget;
        const { left, bottom } = button.getBoundingClientRect();
        this.contextMenuRenderer.render({
            menuPath: MAIN_MENU_BAR,
            includeAnchorArg: false,
            anchor: { x: left, y: bottom },
            context: button,
            contextKeyService: this.contextKeyService
        });
    };

    protected run({ command, arguments: args = [] }: ScmCommand): void {
        if (command) {
            this.commands.executeCommand(command, ...args);
        }
    }
}
