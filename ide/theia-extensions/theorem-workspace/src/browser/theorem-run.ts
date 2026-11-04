// SOURCING: @theia/output is the panel output lands in, @theia/core QuickInputService asks what to run,
// and the host's `run.*` operations keep configurations and processes. Only the loop that copies new
// output across is written here.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { Command, CommandContribution, CommandRegistry, MessageService, QuickInputService } from '@theia/core/lib/common';
import { OutputChannelManager, OutputChannelSeverity } from '@theia/output/lib/browser/output-channel';
import { TheoremConnection } from './theorem-connection';

export namespace TheoremRunCommands {
    const category = 'Run';
    export const ADD: Command = { id: 'theorem.run.add', label: 'Add Configuration...', category };
    export const START: Command = { id: 'theorem.run.start', label: 'Start...', category };
    export const STOP: Command = { id: 'theorem.run.stop', label: 'Stop', category };
}

const CHANNEL = 'Run';
/** How often a running process's new output is read. */
const READ_EVERY_MS = 400;

interface RunState {
    state: string;
    exit_code?: number | null;
    stdout?: string;
    stderr?: string;
}

/**
 * Named commands the workspace host runs in the checkout, with their output in
 * the Output panel. One process at a time; the terminal is there for the rest.
 */
@injectable()
export class TheoremRun implements CommandContribution {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(OutputChannelManager) protected readonly output: OutputChannelManager;
    @inject(QuickInputService) protected readonly quickInput: QuickInputService;
    @inject(MessageService) protected readonly messages: MessageService;

    protected running: string | undefined;

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(TheoremRunCommands.ADD, { execute: () => this.guarded('Adding a configuration', () => this.add()) });
        registry.registerCommand(TheoremRunCommands.START, {
            execute: () => this.guarded('Starting', () => this.start()),
            isEnabled: () => !this.running,
        });
        registry.registerCommand(TheoremRunCommands.STOP, {
            execute: () => this.guarded('Stopping', () => this.stop()),
            isEnabled: () => !!this.running,
        });
    }

    protected async guarded(title: string, run: () => Promise<void>): Promise<void> {
        try {
            await run();
        } catch (error) {
            this.messages.error(`Run: ${title} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    protected async add(): Promise<void> {
        const name = await this.quickInput.input({ prompt: 'Name of the configuration', validateInput: async value => value.trim() ? undefined : 'Give it a name.' });
        if (!name) {
            return;
        }
        const line = await this.quickInput.input({ prompt: `The command "${name}" runs in the checkout's shell`, validateInput: async value => value.trim() ? undefined : 'Give it a command.' });
        if (line) {
            await this.connection.operate('run.configure', { name: name.trim(), argv: ['sh', '-c', line] });
            this.messages.info(`Added "${name.trim()}". Start it with Run: Start...`);
        }
    }

    protected async start(): Promise<void> {
        const { configurations } = await this.connection.operate<{ configurations: { name: string; argv: string[] }[] }>('run.list', {});
        if (!configurations.length) {
            this.messages.info('There are no run configurations yet. Add one with Run: Add Configuration...');
            return;
        }
        const picked = await this.quickInput.showQuickPick(
            configurations.map(({ name, argv }) => ({ label: name, description: argv.at(-1) })),
            { placeholder: 'Select a configuration to run' },
        );
        if (!picked) {
            return;
        }
        const { handle } = await this.connection.operate<{ handle: string }>('run.start', { name: picked.label, wait: false });
        this.running = handle;
        const channel = this.output.getChannel(CHANNEL);
        channel.show({ preserveFocus: true });
        channel.appendLine(`> ${picked.label}`);
        void this.follow(handle);
    }

    protected async stop(): Promise<void> {
        if (this.running) {
            await this.connection.operate('run.stop', { handle: this.running });
        }
    }

    /** Copy what is new to the panel until the process ends; `stop` ends it like any other way. */
    protected async follow(handle: string): Promise<void> {
        const channel = this.output.getChannel(CHANNEL);
        let shownOut = 0;
        let shownErr = 0;
        try {
            for (; ;) {
                const run = await this.connection.operate<RunState>('run.subscribe', { handle });
                const out = run.stdout ?? '';
                const err = run.stderr ?? '';
                channel.append(out.slice(shownOut));
                if (err.length > shownErr) {
                    channel.append(err.slice(shownErr), OutputChannelSeverity.Error);
                }
                shownOut = out.length;
                shownErr = err.length;
                if (run.state !== 'running') {
                    channel.appendLine(`[${run.state}${run.exit_code === null || run.exit_code === undefined ? '' : `, exit code ${run.exit_code}`}]`);
                    return;
                }
                await new Promise(resolve => setTimeout(resolve, READ_EVERY_MS));
            }
        } catch (error) {
            channel.appendLine(`[lost the run: ${error instanceof Error ? error.message : String(error)}]`, OutputChannelSeverity.Error);
        } finally {
            this.running = undefined;
        }
    }
}
