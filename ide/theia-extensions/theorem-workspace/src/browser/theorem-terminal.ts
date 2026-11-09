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
import URI from '@theia/core/lib/common/uri';
import { TerminalWidgetOptions } from '@theia/terminal/lib/browser/base/terminal-widget';
import { TerminalFrontendContribution } from '@theia/terminal/lib/browser/terminal-frontend-contribution';
import { TerminalProfile } from '@theia/terminal/lib/browser/terminal-profile-service';
import { TerminalWidgetImpl } from '@theia/terminal/lib/browser/terminal-widget-impl';
import { TerminalExitReason, TerminalProcessInfo } from '@theia/terminal/lib/common/base-terminal-protocol';
import { TerminalChannel } from '@theoremharness/sdk';
import { TheoremConnection } from './theorem-connection';

let nextTerminalId = 0;

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
            if (this.restoredSession) {
                this.channel = TerminalChannel.reconnect({ ...options, session: this.restoredSession });
            } else {
                const { cols, rows } = this.term;
                this.channel = await TerminalChannel.open({ ...options, cols, rows });
            }
        } catch (error) {
            this.onDidOpenFailureEmitter.fire(undefined);
            throw error;
        }
        this._terminalId = typeof id === 'number' ? id : nextTerminalId++;
        this.exitStatus = undefined;
        this.connectTerminalProcess();
        await this.channel.attach();
        this.resizeTerminalProcess();
        this.onDidOpenEmitter.fire(undefined);
        return this.terminalId;
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

    // A layout restore reattaches terminals that were open; none is started unasked.
    override async initializeLayout(): Promise<void> { }

    override async getDefaultShell(): Promise<string> {
        return '';
    }

    override async openInTerminal(_uri: URI): Promise<void> {
        await this.openTerminal();
    }

    protected override async openTerminal(options?: ApplicationShell.WidgetOptions, _profile?: TerminalProfile): Promise<void> {
        const widget = await this.newTerminal({} as TerminalWidgetOptions);
        await widget.start();
        this.open(widget, { widgetOptions: options });
    }

    protected override async openActiveWorkspaceTerminal(options?: ApplicationShell.WidgetOptions): Promise<void> {
        await this.openTerminal(options);
    }
}
