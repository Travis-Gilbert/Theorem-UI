// SOURCING: penpal (connect + WindowMessenger) links this frame to the Theorem UI around it;
// @theia/editor EditorManager, @theia/core ThemeService, CommandService, ApplicationShell,
// StatusBar, OpenerService and MessageService do every action, @theia/ai-chat-ui's
// AIChatContribution closes the chat view,
// and @theoremharness/sdk converts character units and its WorkspaceLive stream names
// the run behind each edit. Only the mapping between Theia's editors and Theorem
// locations is written here.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import {
    ApplicationShell, FrontendApplicationContribution, KeybindingContribution, KeybindingRegistry, open, OpenerService, StatusBar,
    StatusBarAlignment
} from '@theia/core/lib/browser';
import { ThemeService } from '@theia/core/lib/browser/theming';
import {
    Command, CommandContribution, CommandRegistry, CommandService, DisposableCollection, Emitter, MenuContribution, MenuModelRegistry,
    MessageService
} from '@theia/core/lib/common';
import { Range, TextEditor, TextEditorDocument } from '@theia/editor/lib/browser/editor';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import { AIChatContribution } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { scalarToUtf16, utf8ToUtf16, type TheoremLocation, type TheoremRange, type WorkspaceLiveEvents } from '@theoremharness/sdk';
import { connect, WindowMessenger, type RemoteProxy } from 'penpal';
import type { ChatMessage, ChatThreadUpdate, DelegationChanges, IdeFrameMethods, IdeHostMethods, RevealOptions } from '../common/ide-bridge';
import { TheoremConnection } from './theorem-connection';
import { TheoremDelegations } from './theorem-delegations';
import { themesForPalette } from './theorem-stone-theme';

export const ADD_TO_CHAT: Command = { id: 'theorem.addToChat', label: 'Add Selection to Chat', category: 'Theorem' };

const FOLLOW_ENTRY = 'theorem.follow';

/** The conversation the Theorem UI shows, as its updates leave it. */
export interface ChatThread {
    key: string;
    threadId: string | null;
    title?: string;
    messages: ChatMessage[];
}

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
    @inject(OpenerService) protected readonly openers: OpenerService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(TheoremDelegations) protected readonly delegations: TheoremDelegations;
    @inject(AIChatContribution) protected readonly chatView: AIChatContribution;

    /** The Theorem UI, once linked. */
    host: RemoteProxy<IdeHostMethods> | undefined;
    /** True while a reveal the UI asked for is moving the editor. */
    protected revealing = false;
    /** Whether `navigated` was sent since the last reveal; the UI only needs it once. */
    protected navigatedSent = false;
    protected following = false;
    /** The document authority's actors for the runs Follow the Agent shows. */
    protected followedActors = new Set<string>();
    protected readonly toDisposeOnEditor = new DisposableCollection();

    /** Absent until the Theorem UI sends its conversation. */
    thread: ChatThread | undefined;
    protected readonly onDidUpdateThreadEmitter = new Emitter<ChatThread>();
    readonly onDidUpdateThread = this.onDidUpdateThreadEmitter.event;

    // After the layout exists, so the UI's sidebar state is not undone by the
    // layout Theia restores or creates.
    onDidInitializeLayout(): void {
        if (window.parent === window) {
            return;
        }
        const methods: IdeFrameMethods = {
            reveal: (location, options) => this.reveal(location, options),
            // Stored as the colour theme preference (browser storage), so Theia's own
            // startup does not put the configured theme back over it.
            setTheme: (dark, palette) => this.themes.setCurrentTheme(themesForPalette(palette)[dark ? 'dark' : 'light'], true),
            executeCommand: (id, args = []) => this.commands.executeCommand(id, ...args),
            setSidebar: open => this.setSidebar(open),
            setFollowing: following => this.showFollowing(following),
            setFollowedRuns: runIds => {
                this.followedActors = new Set(runIds.map(runId => `theorem:run:${runId}`));
            },
            openChanges: target => this.openChanges(target),
            setThread: update => this.setThread(update),
            closeChatView: async () => {
                await this.chatView.closeView();
            },
        };
        connect<IdeHostMethods>({ messenger: new WindowMessenger({ remoteWindow: window.parent }), methods: { ...methods } })
            .promise.then(host => {
                this.host = host;
                this.shell.leftPanelHandler.tabBar.currentChanged.connect(() => void host.sidebarChanged(this.sidebarOpen()));
                this.editors.onCurrentEditorChanged(() => this.watchCurrentEditor());
                this.watchCurrentEditor();
                this.connection.live.on('document.changed', ({ data }) => {
                    if (this.following && this.followedActors.has(data.actor)) {
                        void this.showEdit(data);
                    }
                });
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

    /** The first change opens in front; the rest open as tabs behind it. */
    async openChanges(target: DelegationChanges): Promise<boolean> {
        try {
            const uris = await this.delegations.targets(target);
            for (const [index, uri] of uris.entries()) {
                await open(this.openers, uri, { mode: index === 0 ? 'activate' : 'open' });
            }
            return uris.length > 0;
        } catch (error) {
            this.messages.error(`The delegated changes could not be opened: ${error instanceof Error ? error.message : String(error)}`);
            return false;
        }
    }

    /**
     * Where a followed run edited, in the preview editor, without taking focus.
     * Edits count scalars of the parent revision; the text before the first one
     * is the same in both revisions, so the open editor places it whether or not
     * it has the new revision yet.
     */
    protected async showEdit({ path, edits }: WorkspaceLiveEvents['document.changed']): Promise<void> {
        this.revealing = true;
        this.navigatedSent = false;
        try {
            const { editor } = await this.editors.open(this.connection.toUri(path), { mode: 'reveal', preview: true });
            if (!edits.length) {
                return;
            }
            const text = editor.document.getText();
            const offset = scalarToUtf16(text, Math.min(...edits.map(edit => edit.start)));
            const at = editor.document.positionAt(offset);
            editor.selection = { start: at, end: at, direction: 'ltr' };
            editor.revealRange({ start: at, end: at }, { at: 'center' });
        } catch (error) {
            console.warn(`Follow the Agent could not show ${path}`, error);
        } finally {
            this.revealing = false;
        }
    }

    /** Unchanged messages keep their objects, so readers can tell what changed by identity. */
    protected setThread({ key, threadId, title, order, changed }: ChatThreadUpdate): void {
        const known = new Map(this.thread?.key === key ? this.thread.messages.map(m => [m.id, m]) : []);
        for (const message of changed) {
            known.set(message.id, message);
        }
        this.thread = { key, threadId, title, messages: order.flatMap(id => known.get(id) ?? []) };
        this.onDidUpdateThreadEmitter.fire(this.thread);
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
        this.following = following;
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
