// SOURCING: penpal (connect + WindowMessenger) links this frame to the Theorem UI around it;
// @theia/editor EditorManager, @theia/core ThemeService, CommandService, ApplicationShell and
// StatusBar do every action,
// and @theoremharness/sdk converts character units. Only the mapping between Theia's
// editors and Theorem locations is written here.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ApplicationShell, FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry, StatusBar, StatusBarAlignment
} from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import {
    Command, CommandContribution, CommandRegistry, CommandService, DisposableCollection, MenuContribution, MenuModelRegistry
} from '@theia/core/lib/common';
import { Range, TextEditor, TextEditorDocument } from '@theia/editor/lib/browser/editor';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import { scalarToUtf16, utf8ToUtf16, type TheoremLocation, type TheoremRange } from '@theoremharness/sdk';
import { connect, WindowMessenger, type RemoteProxy } from 'penpal';
import type { IdeFrameMethods, IdeHostMethods, RevealOptions } from '../common/ide-bridge';
import { TheoremConnection } from './theorem-connection';

export const ADD_TO_CHAT: Command = { id: 'theorem.addToChat', label: 'Add Selection to Chat', category: 'Theorem' };

const THEMES = { dark: 'zed-one-dark', light: 'zed-one-light' };
const FOLLOW_ENTRY = 'theorem.follow';

/**
 * The frame's side of the link with the Theorem UI: it shows the places the
 * UI asks for, says when the person moved somewhere themselves so Follow the
 * Agent can stand aside, keeps the left side panel in step with the UI's rail
 * and shows Follow the Agent in the status bar.
 */
@injectable()
export class TheoremIdeBridge implements FrontendApplicationContribution, CommandContribution, MenuContribution, KeybindingContribution {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(EditorManager) protected readonly editors: EditorManager;
    @inject(ThemeService) protected readonly themes: ThemeService;
    @inject(CommandService) protected readonly commands: CommandService;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(StatusBar) protected readonly statusBar: StatusBar;

    protected host: RemoteProxy<IdeHostMethods> | undefined;
    /** True while a reveal the UI asked for is moving the editor. */
    protected revealing = false;
    /** Whether `navigated` was sent since the last reveal; the UI only needs it once. */
    protected navigatedSent = false;
    protected readonly toDisposeOnEditor = new DisposableCollection();

    onStart(): void {
        if (window.parent === window) {
            return;
        }
        const methods: IdeFrameMethods = {
            reveal: (location, options) => this.reveal(location, options),
            // Stored as the colour theme preference (browser storage), so Theia's own
            // startup does not put the configured theme back over it.
            setTheme: dark => this.themes.setCurrentTheme(dark ? THEMES.dark : THEMES.light, true),
            executeCommand: (id, args = []) => this.commands.executeCommand(id, ...args),
            setSidebar: open => this.setSidebar(open),
            setFollowing: following => this.showFollowing(following),
        };
        connect<IdeHostMethods>({ messenger: new WindowMessenger({ remoteWindow: window.parent }), methods: { ...methods } })
            .promise.then(host => {
                this.host = host;
                this.shell.leftPanelHandler.tabBar.currentChanged.connect(() => void host.sidebarChanged(this.sidebarOpen()));
                this.editors.onCurrentEditorChanged(() => this.watchCurrentEditor());
                this.watchCurrentEditor();
            }, error => console.warn('Theorem UI link not established', error));
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(ADD_TO_CHAT, {
            isVisible: () => this.host !== undefined,
            isEnabled: () => this.host !== undefined && this.locationOf(this.editors.currentEditor?.editor) !== undefined,
            execute: () => this.addToChat(),
        });
    }

    registerMenus(menus: MenuModelRegistry): void {
        menus.registerMenuAction(EditorContextMenu.NAVIGATION, { commandId: ADD_TO_CHAT.id, order: '0' });
    }

    registerKeybindings(keybindings: KeybindingRegistry): void {
        keybindings.registerKeybinding({ command: ADD_TO_CHAT.id, keybinding: 'ctrlcmd+alt+l', when: 'editorFocus' });
    }

    protected async reveal(location: TheoremLocation, options: RevealOptions = {}): Promise<boolean> {
        const { resource } = location;
        if (resource.kind !== 'file' || resource.workspaceId !== this.connection.workspaceId) {
            return false;
        }
        this.revealing = true;
        this.navigatedSent = false;
        try {
            const widget = await this.editors.open(this.connection.toUri(resource.path), {
                mode: options.preserveFocus ? 'reveal' : 'activate',
                preview: options.preview,
            });
            if (location.range) {
                const range = toUtf16(widget.editor.document, location.range);
                widget.editor.selection = { ...range, direction: 'ltr' };
                widget.editor.revealRange(range, { at: 'center' });
            }
            return true;
        } finally {
            this.revealing = false;
        }
    }

    protected watchCurrentEditor(): void {
        this.toDisposeOnEditor.dispose();
        const editor = this.editors.currentEditor?.editor;
        this.reportNavigation(this.locationOf(editor));
        if (editor) {
            this.toDisposeOnEditor.push(editor.onSelectionChanged(() => {
                if (editor.isFocused()) {
                    this.reportNavigation(this.locationOf(editor));
                }
            }));
        }
    }

    protected reportNavigation(location: TheoremLocation | undefined): void {
        if (location && !this.revealing && !this.navigatedSent) {
            this.navigatedSent = true;
            void this.host?.navigated(location);
        }
    }

    /** Read from the side bar, which changes before the panel it shows. */
    protected sidebarOpen(): boolean {
        return this.shell.leftPanelHandler.tabBar.currentTitle !== null;
    }

    protected setSidebar(open: boolean): void {
        if (open === this.sidebarOpen()) {
            return;
        }
        if (open) {
            this.shell.expandPanel('left');
        } else {
            void this.shell.collapsePanel('left');
        }
    }

    protected showFollowing(following: boolean): void {
        const label = following ? 'Following the agent' : 'Follow the agent';
        this.statusBar.setElement(FOLLOW_ENTRY, {
            text: `$(${following ? 'eye' : 'eye-closed'}) ${label}`,
            tooltip: following ? 'Pause Follow the Agent' : 'Follow the agent',
            accessibilityInformation: { label, role: 'button' },
            alignment: StatusBarAlignment.LEFT,
            priority: 1,
            onclick: () => void this.host?.setFollowing(!following),
        });
    }

    protected addToChat(): void {
        const editor = this.editors.currentEditor?.editor;
        const location = this.locationOf(editor);
        if (!editor || !location || location.resource.kind !== 'file') {
            return;
        }
        const { selection } = editor;
        const empty = selection.start.line === selection.end.line && selection.start.character === selection.end.character;
        const line = selection.start.line + 1;
        const endLine = selection.end.line + 1;
        void this.host?.addToChat({
            location: empty ? { resource: location.resource } : location,
            excerpt: empty ? undefined : editor.document.getText(selection),
            label: empty ? location.resource.path : `${location.resource.path}:${line === endLine ? line : `${line}-${endLine}`}`,
        });
    }

    protected locationOf(editor: TextEditor | undefined): TheoremLocation | undefined {
        const path = editor && this.connection.toPath(editor.uri);
        if (!editor || !path) {
            return undefined;
        }
        const { start, end } = editor.selection;
        return {
            resource: { kind: 'file', workspaceId: this.connection.workspaceId, path },
            range: { start: { ...start }, end: { ...end }, unit: 'utf16' },
        };
    }
}

/** A Theorem range as the editor counts it: zero-based lines, UTF-16 characters. */
function toUtf16(document: TextEditorDocument, range: TheoremRange): Range {
    const character = (line: number, value: number): number => {
        if (range.unit === 'utf16') {
            return value;
        }
        const text = document.getLineContent(line + 1);
        return range.unit === 'scalar' ? scalarToUtf16(text, value) : utf8ToUtf16(text, value);
    };
    return {
        start: { line: range.start.line, character: character(range.start.line, range.start.character) },
        end: { line: range.end.line, character: character(range.end.line, range.end.character) },
    };
}
