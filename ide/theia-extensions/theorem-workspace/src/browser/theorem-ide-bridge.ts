// SOURCING: penpal (connect + WindowMessenger) links this frame to the Theorem UI around it;
// @theia/editor EditorManager, TheoremStoneTheme (the UI's look as a colour theme), CommandService, ApplicationShell,
// StatusBar, OpenerService and MessageService do every action, @theia/ai-chat-ui's
// AIChatContribution closes the chat view, Theia's StatusBarViewModel and LabelParser give the
// status bar's entries as its own widget draws them, @theia/filesystem's FileService lists, makes,
// moves and deletes the files the UI's tree shows and reports their changes,
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
import {
    Command, CommandContribution, CommandRegistry, CommandService, DisposableCollection, Emitter, MenuContribution, MenuModelRegistry,
    MessageService
} from '@theia/core/lib/common';
import { Deferred } from '@theia/core/lib/common/promise-util';
import { LabelParser } from '@theia/core/lib/browser/label-parser';
import { StatusBarViewModel, type StatusBarViewEntry } from '@theia/core/lib/browser/status-bar';
import { MarkdownString } from '@theia/core/lib/common/markdown-rendering';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { Range, TextEditor, TextEditorDocument } from '@theia/editor/lib/browser/editor';
import { EditorManager } from '@theia/editor/lib/browser/editor-manager';
import { EditorContextMenu } from '@theia/editor/lib/browser/editor-menu';
import { AIChatContribution } from '@theia/ai-chat-ui/lib/browser/ai-chat-ui-contribution';
import { scalarToUtf16, utf8ToUtf16, type TheoremLocation, type TheoremRange, type WorkspaceLiveEvents } from '@theoremharness/sdk';
import { connect, WindowMessenger, type RemoteProxy } from 'penpal';
import {
    EMBEDDED_LAYOUT, type ChatMessage, type ChatThreadUpdate, type DelegationChanges, type IdeConnection, type IdeFileEntry, type IdeFrameMethods,
    type IdeHostMethods, type RevealOptions, type StatusBarItem, type StatusBarItems
} from '../common/ide-bridge';
import { TheoremConnection } from './theorem-connection';
import { TheoremDelegations } from './theorem-delegations';
import { TheoremStoneTheme } from './theorem-stone-theme';

export const ADD_TO_CHAT: Command = { id: 'theorem.addToChat', label: 'Add Selection to Chat', category: 'Theorem' };

const FOLLOW_ENTRY = 'theorem.follow';
const CONNECTION_ENTRY = 'theorem.connection';

/** Docked in the Theorem UI's page, which draws the status bar and the file tree; see `EMBEDDED_LAYOUT`. */
const EMBEDDED = new URLSearchParams(window.location.search).get(EMBEDDED_LAYOUT.param) === EMBEDDED_LAYOUT.value;

/** How long the status bar settles before its entries travel, as Theia's own widget debounces its renders. */
const STATUS_BAR_SETTLE_MS = 50;

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
    @inject(CommandService) protected readonly commands: CommandService;
    @inject(ApplicationShell) protected readonly shell: ApplicationShell;
    @inject(StatusBar) protected readonly statusBar: StatusBar;
    @inject(OpenerService) protected readonly openers: OpenerService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(TheoremDelegations) protected readonly delegations: TheoremDelegations;
    @inject(AIChatContribution) protected readonly chatView: AIChatContribution;
    @inject(TheoremStoneTheme) protected readonly look: TheoremStoneTheme;
    @inject(StatusBarViewModel) protected readonly statusBarModel: StatusBarViewModel;
    @inject(LabelParser) protected readonly labels: LabelParser;
    @inject(FileService) protected readonly files: FileService;

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

    /** Resolves once the shell's layout exists, so the UI's sidebar state is not undone by the layout Theia restores or creates. */
    protected readonly layout = new Deferred<void>();

    /**
     * Links to the Theorem UI as soon as the frame starts, before Theia's start-up, which waits for the
     * workspace's files. So the UI hears at once when the workspace does not open, and its Retry reaches
     * the connection while Theia is still waiting; once the workspace opens, Theia goes on starting with
     * no reload. Whatever touches the shell or the editors waits for the layout.
     */
    initialize(): void {
        if (window.parent === window) {
            return;
        }
        const afterLayout = <T>(run: () => T | Promise<T>) => this.layout.promise.then(run);
        const methods: IdeFrameMethods = {
            reveal: (location, options) => afterLayout(() => this.reveal(location, options)),
            setTheme: theme => this.look.follow(theme),
            executeCommand: (id, args = []) => afterLayout(() => this.commands.executeCommand(id, ...args)),
            setSidebar: open => afterLayout(() => this.setSidebar(open)),
            setFollowing: following => afterLayout(() => this.showFollowing(following)),
            setFollowedRuns: runIds => {
                this.followedActors = new Set(runIds.map(runId => `theorem:run:${runId}`));
            },
            openChanges: target => afterLayout(() => this.openChanges(target)),
            setThread: update => this.setThread(update),
            closeChatView: () => afterLayout(() => this.chatView.closeView()).then(() => undefined),
            retryConnection: () => this.connection.retry(),
            runStatusBarItem: id => afterLayout(() => this.runStatusBarItem(id)),
            listFiles: path => this.connection.ready.then(() => this.listFiles(path)),
            createFile: (path, folder) => afterLayout(() => this.createFile(path, folder)),
            moveFile: (from, to) => afterLayout(() => this.files.move(this.connection.toUri(from), this.connection.toUri(to))).then(() => undefined),
            deleteFiles: paths => afterLayout(() => this.deleteFiles(paths)),
        };
        connect<IdeHostMethods>({ messenger: new WindowMessenger({ remoteWindow: window.parent }), methods: { ...methods } })
            .promise.then(host => {
                this.host = host;
                void host.connectionChanged(this.connection.status);
                this.connection.onDidChangeStatus(status => void host.connectionChanged(status));
                this.files.onDidFilesChange(event => {
                    const paths = event.changes.flatMap(({ resource }) => {
                        const path = this.connection.toPath(resource);
                        return path === undefined ? [] : [path];
                    });
                    // The root itself changing means changes were missed: any folder may differ.
                    if (paths.includes('')) {
                        void host.filesChanged([''], true);
                        return;
                    }
                    const folders = new Set(paths.map(path => path.slice(0, Math.max(path.lastIndexOf('/'), 0))));
                    if (folders.size) {
                        void host.filesChanged([...folders]);
                    }
                });
                void afterLayout(() => {
                    if (EMBEDDED) {
                        this.mirrorStatusBar(host);
                    }
                    this.shell.leftPanelHandler.tabBar.currentChanged.connect(() => void host.sidebarChanged(this.sidebarOpen()));
                    this.editors.onCurrentEditorChanged(() => this.watchCurrentEditor());
                    this.watchCurrentEditor();
                    this.connection.live.on('document.changed', ({ data }) => {
                        if (this.following && this.followedActors.has(data.actor)) {
                            void this.showEdit(data);
                        }
                    });
                });
            }, error => console.warn('Theorem UI link not established', error));
    }

    onDidInitializeLayout(): void {
        this.showConnection(this.connection.status);
        this.connection.onDidChangeStatus(status => this.showConnection(status));
        this.layout.resolve();
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

    /** Embedded, the page draws the status bar: its entries travel there whenever they change. */
    protected mirrorStatusBar(host: RemoteProxy<IdeHostMethods>): void {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const send = () => void host.statusBarChanged(this.statusBarItems());
        this.statusBarModel.onDidChange(() => {
            clearTimeout(timer);
            timer = setTimeout(send, STATUS_BAR_SETTLE_MS);
        });
        send();
    }

    protected statusBarItems(): StatusBarItems {
        const item = ({ id, entry }: StatusBarViewEntry): StatusBarItem[] => {
            const label = this.labels.parse(entry.text).flatMap((part): StatusBarItem['label'] => typeof part === 'string'
                ? (part ? [part] : [])
                : [{ icon: part.name.replace(/^codicon-/, ''), spin: part.animation === 'spin' || undefined }]);
            // An entry drawn only by an icon class has nothing the page can draw.
            if (!label.length) {
                return [];
            }
            const tooltip = typeof entry.tooltip === 'string' ? entry.tooltip : MarkdownString.is(entry.tooltip) ? entry.tooltip.value : undefined;
            const colour = `${entry.backgroundColor ?? ''} ${entry.className ?? ''}`;
            return [{
                id,
                label,
                tooltip,
                name: entry.accessibilityInformation?.label ?? entry.name,
                clickable: Boolean(entry.command || entry.onclick),
                active: /\bzed-dock-button-active\b/.test(entry.className ?? '') || undefined,
                tone: /error/i.test(colour) ? 'error' : /warning/i.test(colour) ? 'warning' : /prominent|remote/i.test(colour) ? 'prominent' : undefined,
            }];
        };
        return { left: [...this.statusBarModel.getLeft()].flatMap(item), right: [...this.statusBarModel.getRight()].flatMap(item) };
    }

    /** What a click on the entry does in Theia's own status bar. */
    protected async runStatusBarItem(id: string): Promise<void> {
        const view = [...this.statusBarModel.getLeft(), ...this.statusBarModel.getRight()].find(candidate => candidate.id === id);
        if (!view) {
            return;
        }
        // A command's quick pick or dialog opens in this frame, so the keyboard comes here with it.
        window.focus();
        const { command, arguments: args = [], onclick } = view.entry;
        if (command) {
            await this.commands.executeCommand(command, ...args);
        } else {
            onclick?.(new MouseEvent('click'));
        }
    }

    protected async listFiles(path: string): Promise<IdeFileEntry[]> {
        const { children = [] } = await this.files.resolve(this.connection.toUri(path));
        const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
        return children
            .map(child => ({ name: child.name, path: path ? `${path}/${child.name}` : child.name, folder: child.isDirectory }))
            .sort((a, b) => Number(b.folder) - Number(a.folder) || collator.compare(a.name, b.name));
    }

    protected async createFile(path: string, folder = false): Promise<void> {
        const uri = this.connection.toUri(path);
        if (folder) {
            await this.files.createFolder(uri);
            return;
        }
        await this.files.createFile(uri);
        await this.editors.open(uri, { mode: 'activate' });
    }

    protected async deleteFiles(paths: string[]): Promise<void> {
        for (const path of paths) {
            await this.files.delete(this.connection.toUri(path), { recursive: true, useTrash: false });
        }
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

    /** The attachment while it is not fully up, in the status bar; nothing once the workspace and its live stream are open. */
    protected showConnection({ workspace, live, error }: IdeConnection): void {
        const entry = workspace === 'failed'
            ? { text: '$(error) Workspace unavailable, Retry', tooltip: error ? `${error}. Click to try again now.` : 'Click to try again now.' }
            : workspace === 'opening'
                ? { text: '$(sync~spin) Opening the workspace', tooltip: 'Opening the workspace on Theorem' }
                : live === 'connecting' || live === 'reconnecting' || live === 'resyncing'
                    ? { text: '$(sync~spin) Reconnecting live changes', tooltip: 'Edits made elsewhere show once the live stream is back' }
                    : undefined;
        if (!entry) {
            this.statusBar.removeElement(CONNECTION_ENTRY);
            return;
        }
        this.statusBar.setElement(CONNECTION_ENTRY, {
            ...entry,
            accessibilityInformation: { label: entry.text.replace(/\$\([^)]*\) /, ''), role: workspace === 'failed' ? 'button' : 'status' },
            alignment: StatusBarAlignment.LEFT,
            priority: 2,
            onclick: workspace === 'failed' ? () => this.connection.retry() : undefined,
        });
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
