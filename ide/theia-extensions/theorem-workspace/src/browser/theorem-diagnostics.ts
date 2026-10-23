// SOURCING: @theia/markers ProblemManager holds the findings (Theia's monaco module shows them in
// editors, the Problems view lists them); @theoremharness/sdk WorkspaceLanguage reads them and
// positionAt converts their byte offsets. This file only decides when to read and which text
// a snapshot belongs to.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ILogger } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { DiagnosticSeverity } from '@theia/core/shared/vscode-languageserver-protocol';
import { ProblemManager } from '@theia/markers/lib/browser/problem/problem-manager';
import * as monaco from '@theia/monaco-editor-core';
import { positionAt, type WorkspaceDiagnostic } from '@theoremharness/sdk';
import { DocumentLease, TheoremConnection } from './theorem-connection';
import { languageOf } from './theorem-language-features';

const OWNER = 'theorem';
/** Typing settles for this long before findings are read again. */
const PULL_DELAY_MS = 400;

const SEVERITY: Record<WorkspaceDiagnostic['severity'], DiagnosticSeverity> = {
    error: DiagnosticSeverity.Error,
    warning: DiagnosticSeverity.Warning,
    info: DiagnosticSeverity.Information,
    hint: DiagnosticSeverity.Hint,
};

interface OpenDocument {
    uri: URI;
    model: monaco.editor.ITextModel;
    timer?: ReturnType<typeof setTimeout>;
}

/**
 * The host's findings for every open workspace document. A document is read
 * again when its text changes (anyone's edit), when any file in the checkout
 * changes (findings can depend on other files), and after the live stream
 * resyncs. A snapshot is kept only if it was computed for the text this
 * editor holds; otherwise the change that moved the text brings another read.
 */
@injectable()
export class TheoremDiagnostics implements FrontendApplicationContribution {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(ProblemManager) protected readonly problems: ProblemManager;
    @inject(ILogger) protected readonly logger: ILogger;

    protected readonly open = new Map<string, OpenDocument>();

    onStart(): void {
        monaco.editor.getModels().forEach(model => this.watch(model));
        monaco.editor.onDidCreateModel(model => this.watch(model));
        this.connection.ready.then(() => {
            this.connection.live.on('file.changed', () => this.scheduleAll());
            this.connection.live.onResync(() => this.scheduleAll());
        }, () => undefined);
    }

    protected watch(model: monaco.editor.ITextModel): void {
        const uri = new URI(model.uri.toString());
        const resourceId = this.connection.toPath(uri);
        if (!resourceId) {
            return;
        }
        this.open.set(resourceId, { uri, model });
        const changed = model.onDidChangeContent(() => this.schedule(resourceId));
        const disposed = model.onWillDispose(() => {
            clearTimeout(this.open.get(resourceId)?.timer);
            this.open.delete(resourceId);
            changed.dispose();
            disposed.dispose();
            this.problems.setMarkers(uri, OWNER, []);
        });
        this.schedule(resourceId);
    }

    protected scheduleAll(): void {
        for (const resourceId of this.open.keys()) {
            this.schedule(resourceId);
        }
    }

    protected schedule(resourceId: string): void {
        const document = this.open.get(resourceId);
        if (document) {
            clearTimeout(document.timer);
            document.timer = setTimeout(() => this.pull(resourceId), PULL_DELAY_MS);
        }
    }

    protected async pull(resourceId: string): Promise<void> {
        const document = this.open.get(resourceId);
        if (!document) {
            return;
        }
        let lease: DocumentLease | undefined;
        try {
            lease = await this.connection.acquire(resourceId);
            const { session } = lease;
            await session.flushed();
            const snapshot = await (await this.connection.language()).diagnostics({ resourceId, language: languageOf(document.model), revision: session.revision });
            // Offsets count bytes of the snapshot's revision; any other text would misplace them.
            if (snapshot.revision !== session.revision || session.pending || this.open.get(resourceId) !== document) {
                return;
            }
            const { text } = session;
            this.problems.setMarkers(document.uri, OWNER, snapshot.diagnostics.map(finding => ({
                range: { start: positionAt(text, finding.start), end: positionAt(text, finding.end) },
                severity: SEVERITY[finding.severity],
                message: finding.message,
                source: finding.provider,
            })));
        } catch (error) {
            this.logger.debug(`Reading findings for ${resourceId} failed`, error);
        } finally {
            lease?.release();
        }
    }
}
