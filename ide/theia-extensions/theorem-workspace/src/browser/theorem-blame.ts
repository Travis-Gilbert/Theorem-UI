// SOURCING: Monaco's decorations collection draws the text after the line, @theia/editor EditorManager
// says which editor is current, @theia/core StorageService remembers the toggle, and the host's
// `scm.blame` runs git. Only the choice of when to read and redraw is written here.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution, StorageService } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry, DisposableCollection, ILogger } from '@theia/core/lib/common';
import { EditorManager } from '@theia/editor/lib/browser';
import { MonacoEditor } from '@theia/monaco/lib/browser/monaco-editor';
import * as monaco from '@theia/monaco-editor-core';
import { blameText, hunkAt, type BlameHunk } from './blame-hunks';
import { TheoremConnection } from './theorem-connection';

export const TOGGLE_LINE_BLAME: Command = { id: 'theorem.scm.toggleLineBlame', label: 'Toggle Line Blame', category: 'Git' };

const ENABLED_KEY = 'theorem.lineBlame';

/**
 * Who last touched the line under the cursor, dimmed after its text. Off until
 * asked for. Hidden while the editor has unsaved edits, since blame describes
 * the file on disk and its lines no longer match.
 */
@injectable()
export class TheoremBlame implements FrontendApplicationContribution, CommandContribution {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(EditorManager) protected readonly editors: EditorManager;
    @inject(StorageService) protected readonly storage: StorageService;
    @inject(ILogger) protected readonly logger: ILogger;

    protected enabled = false;
    protected readonly hunks = new Map<string, Promise<BlameHunk[]>>();
    protected readonly toDisposeOnEditor = new DisposableCollection();
    protected decorations: monaco.editor.IEditorDecorationsCollection | undefined;

    async onStart(): Promise<void> {
        this.editors.onCurrentEditorChanged(() => this.follow());
        this.enabled = await this.storage.getData<boolean>(ENABLED_KEY, false);
        this.follow();
        this.connection.ready.then(() => {
            const { live } = this.connection;
            live.on('document.saved', () => this.invalidate());
            live.on('file.changed', () => this.invalidate());
            live.onResync(() => this.invalidate());
        }, () => undefined);
    }

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(TOGGLE_LINE_BLAME, {
            execute: async () => {
                this.enabled = !this.enabled;
                await this.storage.setData(ENABLED_KEY, this.enabled);
                this.follow();
            },
        });
    }

    protected invalidate(): void {
        this.hunks.clear();
        void this.render();
    }

    /** Listen to the current editor only. */
    protected follow(): void {
        this.toDisposeOnEditor.dispose();
        this.decorations?.clear();
        this.decorations = undefined;
        const editor = this.current();
        if (!this.enabled || !editor) {
            return;
        }
        const control = editor.getControl();
        this.decorations = control.createDecorationsCollection();
        this.toDisposeOnEditor.pushAll([
            control.onDidChangeCursorPosition(() => this.render()),
            control.onDidChangeModelContent(() => this.render()),
            editor.document.onDirtyChanged(() => this.render()),
        ]);
        void this.render();
    }

    protected current(): MonacoEditor | undefined {
        return MonacoEditor.get(this.editors.currentEditor);
    }

    protected async render(): Promise<void> {
        const editor = this.current();
        const decorations = this.decorations;
        const path = editor && this.connection.toPath(editor.uri);
        if (!this.enabled || !editor || !decorations || !path || editor.document.dirty) {
            decorations?.clear();
            return;
        }
        const line = editor.getControl().getPosition()?.lineNumber ?? 1;
        const hunk = hunkAt(await this.read(path), line);
        // The cursor or the editor may have moved during the read; the newer render owns the result.
        if (decorations !== this.decorations || editor.getControl().getPosition()?.lineNumber !== line || editor.document.dirty) {
            return;
        }
        if (!hunk) {
            decorations.clear();
            return;
        }
        const end = editor.getControl().getModel()?.getLineMaxColumn(line) ?? 1;
        decorations.set([{
            range: new monaco.Range(line, end, line, end),
            options: {
                showIfCollapsed: true,
                after: { content: `    ${blameText(hunk)}`, inlineClassName: 'theorem-blame' },
            },
        }]);
    }

    /** A file git does not know reads as having no hunks. */
    protected read(path: string): Promise<BlameHunk[]> {
        let hunks = this.hunks.get(path);
        if (!hunks) {
            hunks = this.connection.operate<{ hunks: BlameHunk[] }>('scm.blame', { path }).then(answer => answer.hunks ?? [], error => {
                this.logger.debug(`Blaming ${path} failed`, error);
                return [];
            });
            this.hunks.set(path, hunks);
        }
        return hunks;
    }
}
