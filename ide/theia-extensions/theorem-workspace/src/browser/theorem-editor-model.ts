// SOURCING: @theia/monaco MonacoEditorModelFactory and MonacoEditorModel are the seam; the
// shared text, pending edits, transforms and per-client undo all live in @theoremharness/sdk
// DocumentSession. This file only moves change sets between the two.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { ILogger, MessageService } from '@theia/core/lib/common';
import { Resource } from '@theia/core/lib/common/resource';
import URI from '@theia/core/lib/common/uri';
import { EditorPreferences } from '@theia/editor/lib/common/editor-preferences';
import { MonacoEditorModel } from '@theia/monaco/lib/browser/monaco-editor-model';
import { MonacoEditorModelFactory } from '@theia/monaco/lib/browser/monaco-text-model-service';
import { MonacoToProtocolConverter } from '@theia/monaco/lib/browser/monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from '@theia/monaco/lib/browser/protocol-to-monaco-converter';
import * as monaco from '@theia/monaco-editor-core';
import type { TextChange } from '@theoremharness/sdk';
import { DocumentLease, TheoremConnection } from './theorem-connection';

/** Typing within this window joins the previous undo step, as Monaco's own stack does. */
const TYPING_MERGE_MS = 1000;

/** The document's text as Theia reads and saves it; the session stays the source. */
class TheoremDocumentResource implements Resource {

    constructor(readonly lease: DocumentLease, protected readonly file: Resource) { }

    get uri(): URI {
        return this.file.uri;
    }

    async readContents(): Promise<string> {
        return this.lease.session.text;
    }

    async saveContents(): Promise<void> {
        await this.lease.session.save();
    }

    dispose(): void {
        this.lease.release();
        this.file.dispose();
    }
}

/**
 * A Monaco model mirroring one shared document. Local changes go to the
 * session; accepted changes from other writers are applied here without
 * entering any undo stack. Undo and redo revert this client's edits only.
 */
export class TheoremEditorModel extends MonacoEditorModel {

    protected applyingSession = false;
    protected lastTyping = 0;

    constructor(
        protected readonly document: TheoremDocumentResource,
        m2p: MonacoToProtocolConverter,
        p2m: ProtocolToMonacoConverter,
        protected readonly messages: MessageService,
        logger?: ILogger,
        editorPreferences?: EditorPreferences
    ) {
        super(document, m2p, p2m, logger, editorPreferences);
    }

    protected get session(): DocumentLease['session'] {
        return this.document.lease.session;
    }

    protected override initialize(value: string): void {
        super.initialize(value);
        if (this.toDispose.disposed) {
            return;
        }
        const { session } = this;
        this.toDispose.push(this.model.onDidChangeContent(event => {
            if (this.applyingSession) {
                return;
            }
            const changes = event.changes.map(change => ({
                start: change.rangeOffset,
                end: change.rangeOffset + change.rangeLength,
                insert: change.text,
            }));
            const typing = changes.length === 1 && changes[0].start === changes[0].end && !changes[0].insert.includes('\n');
            const now = Date.now();
            session.edit(changes, { merge: typing && now - this.lastTyping < TYPING_MERGE_MS });
            this.lastTyping = typing ? now : 0;
        }));
        const detach = [
            session.onRemoteChange(changes => this.applySessionChanges(changes)),
            session.onStateChange(() => this.setDirty(session.dirty)),
            session.onConflict(conflict => this.askConflict(conflict.disk_deleted)),
            session.onError(error => this.messages.error(`${this.document.uri.path.base}: edits were refused and dropped (${String(error)})`)),
        ];
        this.toDispose.push({ dispose: () => detach.forEach(stop => stop()) });
        // Monaco's Undo and Redo commands call the text model directly.
        this.model.undo = () => this.undo();
        this.model.redo = () => this.redo();
        this.model.canUndo = () => session.canUndo;
        this.model.canRedo = () => session.canRedo;
        this.setDirty(session.dirty);
    }

    override undo(): void {
        this.applySessionChanges(this.session.undo());
        this.lastTyping = 0;
    }

    override redo(): void {
        this.applySessionChanges(this.session.redo());
        this.lastTyping = 0;
    }

    /** Dirty means the checkout lacks text this document shows, whoever typed it. */
    protected override setDirty(_dirty: boolean): void {
        super.setDirty(this.session.dirty);
    }

    protected applySessionChanges(changes: TextChange[]): void {
        if (changes.length === 0) {
            return;
        }
        const operations = changes.map(change => ({
            range: monaco.Range.fromPositions(this.model.getPositionAt(change.start), this.model.getPositionAt(change.end)),
            text: change.insert,
            forceMoveMarkers: true,
        }));
        this.applyingSession = true;
        try {
            this.applyEdits(operations, { ignoreDirty: true });
        } finally {
            this.applyingSession = false;
        }
    }

    protected async askConflict(diskDeleted: boolean): Promise<void> {
        const keepMine = 'Keep the open text';
        const takeDisk = diskDeleted ? 'Accept the deletion' : 'Take the file on disk';
        const choice = await this.messages.warn(
            `${this.document.uri.path.base} changed on disk while it has unsaved edits.`,
            keepMine,
            takeDisk
        );
        if (choice) {
            await this.session.resolveConflict(choice === keepMine ? 'authority' : 'disk');
        }
    }
}

/** Every `file` model in the workspace is a shared document. */
@injectable()
export class TheoremEditorModelFactory implements MonacoEditorModelFactory {

    readonly scheme = 'file';

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter;
    @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(ILogger) protected readonly logger: ILogger;
    @inject(EditorPreferences) protected readonly editorPreferences: EditorPreferences;

    async createModel(resource: Resource): Promise<MonacoEditorModel> {
        const path = this.connection.toPath(resource.uri);
        if (path) {
            try {
                const lease = await this.connection.acquire(path);
                const document = new TheoremDocumentResource(lease, resource);
                return new TheoremEditorModel(document, this.m2p, this.p2m, this.messages, this.logger, this.editorPreferences);
            } catch (error) {
                this.logger.warn(`Opening ${path} without a shared session`, error);
            }
        }
        return new MonacoEditorModel(resource, this.m2p, this.p2m, this.logger, this.editorPreferences);
    }
}
