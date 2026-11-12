// SOURCING: @theia/terminal TerminalWidgetImpl (xterm, search, links, theming) and
// TerminalFrontendContribution (commands, menus, profiles) are reused whole; only their
// process plumbing is pointed at @theoremharness/sdk TerminalChannel, as the browser-only
// terminal module does for its own (absent) backend.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { ApplicationShell } from '@theia/core/lib/browser';
import { Command, CommandRegistry, MenuModelRegistry } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { TerminalWidgetOptions } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalFrontendContribution, TerminalMenus } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalProfile } from '@theia/terminal/lib/browser/terminal-profile-service';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TerminalExitReason, TerminalProcessInfo } from '@theia/terminal/lib/common/base-terminal-protocol';
import { TerminalChannel } from '@theoremharness/sdk';
import { TheoremConnection } from './theorem-connection';
import { herdrReady, openBody, partitionProfiles, profileById, TERMINAL_PROFILES, type TheoremTerminalProfile } from './terminal-profile';

let nextTerminalId = 0;

/** Theia's options plus the profile the host starts, kept with the widget so a reload restores it. */
export interface TheoremTerminalWidgetOptions extends TerminalWidgetOptions {
    theoremProfile?: string;
}

/** Ends the host process; Theia's "Kill Terminal" closes the widget, which here only detaches. */
export const END_PROCESS: Command = { id: 'theorem.terminal.endProcess', label: 'End Terminal Process', category: 'Terminal' };

/** A Theia terminal whose shell is a Theorem workspace terminal session. */
@injectable()
export class TheoremTerminalWidget extends TerminalWidgetImpl {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;

    protected channel: TerminalChannel | undefined;
    /** The host session to reach again after a reload, from `restoreState`. */
    protected restoredSession: string | undefined;
    /** The host no longer has this tab's shell, for example after it restarted. */
    protected lostShell = false;
    protected readonly decoder = new TextDecoder();

    override async start(id?: number): Promise<number> {
        try {
            const options = await this.connection.channelOptions();
            // The vendored SDK's `TerminalChannel.open` sends only the size, so the open goes through
            // `operate` with the profile's backend and program; `open` is that call plus `reconnect`.
            const session = this.restoredSession ?? (await this.connection.operate<{ session: string }>(
                'terminal.open',
                openBody(this.profile, this.term.cols, this.term.rows),
            )).session;
            this.channel = TerminalChannel.reconnect({ ...options, session });
        } catch (error) {
            this.onDidOpenFailureEmitter.fire(undefined);
            throw error;
        }
        this._terminalId = typeof id === 'number' ? id : nextTerminalId++;
        this.exitStatus = undefined;
        this.connectTerminalProcess();
        this.followHostRestarts();
        await this.channel.attach();
        this.resizeTerminalProcess();
        this.onDidOpenEmitter.fire(undefined);
        return this.terminalId;
    }

    /** The profile this widget was opened with; restored with the widget's options after a reload. */
    protected get profile(): TheoremTerminalProfile | undefined {
        return profileById((this.options as TheoremTerminalWidgetOptions).theoremProfile);
    }

    /**
     * A Herdr terminal outlives a host restart, but the host re-adopts it with a fresh byte log, and
     * the vendored SDK's channel would wait for offsets past the ones it already showed. On a new
     * host epoch, follow the same session from the start of its new log instead.
     */
    protected followHostRestarts(): void {
        if (this.profile?.backend !== 'herdr') {
            return;
        }
        const stop = this.connection.live.onResync(resync => {
            if (resync.reason === 'epoch_changed' && this.channel && !this.channel.hasExited) {
                return this.rebind(this.channel);
            }
        });
        this.toDispose.push({ dispose: stop });
    }

    protected async rebind(previous: TerminalChannel): Promise<void> {
        const options = await this.connection.channelOptions();
        this.channel = TerminalChannel.reconnect({ ...options, session: previous.session });
        void previous.close().catch(() => undefined);
        this.term.reset();
        this.connectTerminalProcess();
        await this.channel.attach();
    }

    protected override connectTerminalProcess(): void {
        const channel = this.channel;
        if (!channel) {
            return;
        }
        this.toDisposeOnConnect.dispose();
        this.toDispose.push(this.toDisposeOnConnect);
        const send = (data: string) => {
            if (channel.hasExited) {
                // A shell lost with its host is never resumed; Enter opens a new one in this tab.
                if (this.lostShell && data === '\r') {
                    void this.replaceLostShell();
                }
                return;
            }
            if (data && !this.deviceStatusCodes.has(data)) {
                void channel.input(data);
            }
        };
        const stops = [
            channel.onData(bytes => this.write(this.decoder.decode(bytes, { stream: true }))),
            channel.onReset(screen => {
                this.term.reset();
                this.write(screen);
            }),
            channel.onExit((code, reason?: 'exited' | 'lost') => {
                this.lostShell = reason === 'lost';
                this.exitStatus = {
                    code: code ?? undefined,
                    reason: this.lostShell ? TerminalExitReason.Unknown : TerminalExitReason.Process,
                };
                if (this.lostShell) {
                    this.write('\r\n\x1b[2mThis shell ended when the workspace host restarted. Press Enter for a new shell.\x1b[0m\r\n');
                }
            }),
        ];
        this.toDisposeOnConnect.push({ dispose: () => stops.forEach(stop => stop()) });
        this.toDisposeOnConnect.push(this.term.onData(send));
        this.toDisposeOnConnect.push(this.term.onBinary(send));
    }

    /**
     * Start a new shell in this tab in place of one the host lost. The lost
     * shell stays until the new one attaches, so a failed start leaves Enter
     * able to try again.
     */
    protected async replaceLostShell(): Promise<void> {
        const lost = this.channel;
        this.lostShell = false;
        this.restoredSession = undefined;
        let next: TerminalChannel | undefined;
        try {
            const options = await this.connection.channelOptions();
            const { cols, rows } = this.term;
            next = await TerminalChannel.open({ ...options, cols, rows });
            this.channel = next;
            this.exitStatus = undefined;
            this.connectTerminalProcess();
            await next.attach();
        } catch (error) {
            void next?.close();
            this.channel = lost;
            this.connectTerminalProcess();
            this.lostShell = true;
            const reason = error instanceof Error ? error.message : String(error);
            this.write(`\r\n\x1b[2mA new shell could not start (${reason}). Press Enter to try again.\x1b[0m\r\n`);
            return;
        }
        void lost?.close();
        this.resizeTerminalProcess();
    }

    override sendText(text: string): void {
        if (!this.channel?.hasExited) {
            void this.channel?.input(text);
        }
    }

    protected override resizeTerminalProcess(): void {
        if (!this.channel || this.channel.hasExited) {
            return;
        }
        const { cols, rows } = this.term;
        void this.channel.resize(cols, rows);
    }

    override get processId(): Promise<number> {
        return Promise.resolve(-1);
    }

    override get processInfo(): Promise<TerminalProcessInfo> {
        return Promise.resolve({ executable: '', arguments: [] });
    }

    override get cwd(): Promise<URI> {
        return Promise.resolve(this.connection.root);
    }

    override storeState(): object {
        const state = super.storeState();
        return this.channel && 'terminalId' in state ? { ...state, theoremSession: this.channel.session } : state;
    }

    override restoreState(oldState: object): void {
        this.restoredSession = (oldState as { theoremSession?: string }).theoremSession;
        super.restoreState(oldState);
    }

    /** Whether this terminal's host can end its process (hosts before `terminal.kill` cannot). */
    async canEndProcess(): Promise<boolean> {
        return !!this.channel && !this.channel.hasExited && this.connection.offers('terminal.kill');
    }

    /** End the program on the host. Closing the widget only detaches; this terminates. */
    async endProcess(): Promise<void> {
        if (this.channel) {
            await this.connection.operate('terminal.kill', { session: this.channel.session });
        }
    }

    /** Closing the widget detaches; the host keeps the shell for its other clients. */
    override dispose(): void {
        this.closeOnDispose = false;
        void this.channel?.close();
        this.channel = undefined;
        super.dispose();
    }
}

/** Terminal commands and menus as Theia has them, without a Theia backend shell server. */
@injectable()
export class TheoremTerminalFrontendContribution extends TerminalFrontendContribution {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;

    // A layout restore reattaches terminals that were open; none is started unasked.
    override async initializeLayout(): Promise<void> { }

    override async getDefaultShell(): Promise<string> {
        return '';
    }

    /**
     * The host's terminals instead of Theia's local shell profile, which names a path on the browser's
     * machine. Herdr profiles appear only once the workspace host reports Herdr ready.
     */
    override async contributeDefaultProfiles(): Promise<void> {
        const [native, herdr] = partitionProfiles(TERMINAL_PROFILES);
        native.forEach(profile => this.registerProfile(profile));
        if (herdr.length > 0 && herdrReady(await this.connection.capabilities().catch(() => undefined))) {
            herdr.forEach(profile => this.registerProfile(profile));
        }
    }

    protected registerProfile(profile: TheoremTerminalProfile): void {
        this.contributedProfileStore.registerTerminalProfile(profile.id, {
            start: async () => {
                const widget = await this.newTerminal({ title: profile.id, theoremProfile: profile.id } as TheoremTerminalWidgetOptions);
                await widget.start();
                return widget;
            },
        });
    }

    override registerCommands(commands: CommandRegistry): void {
        super.registerCommands(commands);
        commands.registerCommand(END_PROCESS, {
            isEnabled: () => this.currentTerminal instanceof TheoremTerminalWidget && !this.currentTerminal.exitStatus,
            execute: async () => {
                const terminal = this.currentTerminal;
                if (terminal instanceof TheoremTerminalWidget && await terminal.canEndProcess()) {
                    await terminal.endProcess();
                }
            },
        });
    }

    override registerMenus(menus: MenuModelRegistry): void {
        super.registerMenus(menus);
        menus.registerMenuAction([...TerminalMenus.TERMINAL_CONTEXT_MENU, '_4'], { commandId: END_PROCESS.id });
    }

    override async openInTerminal(_uri: URI): Promise<void> {
        await this.openTerminal();
    }

    /** A chosen profile, else the default one; the host picks the directory, so no cwd prompt. */
    protected override async openTerminal(options?: ApplicationShell.WidgetOptions, profile?: TerminalProfile): Promise<void> {
        const chosen = profile ?? this.profileService.defaultProfile;
        const widget = chosen ? await chosen.start() : await this.newTerminal({} as TerminalWidgetOptions);
        if (!chosen) {
            await widget.start();
        }
        this.open(widget, { widgetOptions: options });
    }

    protected override async openActiveWorkspaceTerminal(options?: ApplicationShell.WidgetOptions): Promise<void> {
        await this.openTerminal(options);
    }
}
