// SOURCING: @theia/monaco-editor-core monaco.languages providers are the editor seam, @theia/monaco
// ProtocolToMonacoConverter and MonacoToProtocolConverter convert LSP shapes, and
// @theoremharness/sdk WorkspaceLanguage makes every call and converts coordinate units.
// This file only maps one onto the other; the host's extension host does the language work.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { Command, CommandContribution, CommandRegistry, DisposableCollection, ILogger, MessageService } from '@theia/core/lib/common';
import URI from '@theia/core/lib/common/uri';
import { FileService } from '@theia/filesystem/lib/browser/file-service';
import { MonacoToProtocolConverter } from '@theia/monaco/lib/browser/monaco-to-protocol-converter';
import { ProtocolToMonacoConverter } from '@theia/monaco/lib/browser/protocol-to-monaco-converter';
import * as monaco from '@theia/monaco-editor-core';
import {
    isDocumentSpan, rangeIn, type DocumentPosition, type DocumentRef, type LanguageCodeAction, type LanguageCompletionItem,
    type LanguageLocation, type LanguagePlan, type LanguageSymbol, type NavigationKind, type Ranged, type WorkspaceLanguage
} from '@theoremharness/sdk';
import { TheoremConnection } from './theorem-connection';

export const APPLY_CODE_ACTION: Command = { id: 'theorem.applyCodeAction' };

/** Every workspace document is a `file` model; models outside the workspace root are skipped per call. */
const SELECTOR: monaco.languages.LanguageSelector = { scheme: 'file' };

/** One workspace document a request is about. */
interface Target extends DocumentRef {
    api: WorkspaceLanguage;
}

const markdown = (value: string | undefined): monaco.IMarkdownString | undefined => value ? { value } : undefined;

/** The editor's language id, unless it is only Theia's fallback; the host then infers it from the path. */
export const languageOf = (model: monaco.editor.ITextModel): string | undefined => {
    const id = model.getLanguageId();
    return id === 'plaintext' ? undefined : id;
};

/**
 * Monaco's language features over the workspace's language host. Each request
 * first sends this editor's pending edits, so the host answers for the text the
 * person sees. Edits a feature proposes (format, rename, code actions) are
 * applied by the document authority as plans and reach every editor as new
 * revisions, so the providers return no edits of their own.
 */
@injectable()
export class TheoremLanguageFeatures implements FrontendApplicationContribution, CommandContribution {

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;
    @inject(ProtocolToMonacoConverter) protected readonly p2m: ProtocolToMonacoConverter;
    @inject(MonacoToProtocolConverter) protected readonly m2p: MonacoToProtocolConverter;
    @inject(FileService) protected readonly files: FileService;
    @inject(MessageService) protected readonly messages: MessageService;
    @inject(ILogger) protected readonly logger: ILogger;

    protected readonly toDispose = new DisposableCollection();
    /** Where each offered completion came from, for resolving it. */
    protected readonly completions = new WeakMap<monaco.languages.CompletionItem, { position: DocumentPosition; item: LanguageCompletionItem }>();

    registerCommands(registry: CommandRegistry): void {
        registry.registerCommand(APPLY_CODE_ACTION, {
            execute: (document: DocumentRef, action: LanguageCodeAction) => this.perform(action.title, async () => {
                const api = await this.connection.language();
                await (action.plan_id ? api.applyPlan(action.plan_id) : api.runCodeAction(document, action));
            }),
        });
    }

    onStart(): void {
        const navigate = (kind: NavigationKind) => (model: monaco.editor.ITextModel, position: monaco.Position) =>
            this.ask(model, async target => this.locations(await target.api.navigate(kind, this.at(target, position))));
        const { languages } = monaco;
        this.toDispose.pushAll([
            languages.registerCompletionItemProvider(SELECTOR, {
                triggerCharacters: ['.', ':', '<', '/', '"', '\'', '@'],
                provideCompletionItems: (model, position) => this.ask(model, async target => {
                    const at = this.at(target, position);
                    const word = model.getWordUntilPosition(position);
                    const fallback = new monaco.Range(position.lineNumber, word.startColumn, position.lineNumber, word.endColumn);
                    const items = await target.api.complete(at);
                    return { suggestions: items.map(item => this.suggestion(item, at, fallback)) };
                }),
                resolveCompletionItem: suggestion => this.resolveCompletion(suggestion),
            }),
            languages.registerHoverProvider(SELECTOR, {
                provideHover: (model, position) => this.ask(model, async target => {
                    const hover = await target.api.hover(this.at(target, position));
                    return hover.contents ? { contents: [{ value: hover.contents }], range: this.rangeOf(model, hover) } : undefined;
                }),
            }),
            languages.registerSignatureHelpProvider(SELECTOR, {
                signatureHelpTriggerCharacters: ['(', ','],
                signatureHelpRetriggerCharacters: [')'],
                provideSignatureHelp: (model, position) => this.ask(model, async target => {
                    const help = await target.api.signatureHelp(this.at(target, position));
                    return help && {
                        value: {
                            activeSignature: help.activeSignature,
                            activeParameter: help.activeParameter,
                            signatures: help.signatures.map(signature => ({
                                label: signature.label,
                                documentation: markdown(signature.documentation),
                                activeParameter: signature.activeParameter,
                                parameters: signature.parameters.map(parameter => ({
                                    label: parameter.label,
                                    documentation: markdown(parameter.documentation),
                                })),
                            })),
                        },
                        dispose: () => undefined,
                    };
                }),
            }),
            languages.registerDefinitionProvider(SELECTOR, { provideDefinition: navigate('definition') }),
            languages.registerDeclarationProvider(SELECTOR, { provideDeclaration: navigate('declaration') }),
            languages.registerTypeDefinitionProvider(SELECTOR, { provideTypeDefinition: navigate('typeDefinition') }),
            languages.registerImplementationProvider(SELECTOR, { provideImplementation: navigate('implementation') }),
            languages.registerReferenceProvider(SELECTOR, {
                provideReferences: (model, position, context) => this.ask(model, async target =>
                    this.locations(await target.api.references(this.at(target, position), context.includeDeclaration))),
            }),
            languages.registerDocumentSymbolProvider(SELECTOR, {
                displayName: 'Theorem',
                provideDocumentSymbols: model => this.ask(model, async target => {
                    const toSymbol = (symbol: LanguageSymbol): monaco.languages.DocumentSymbol => ({
                        name: symbol.name,
                        detail: symbol.detail,
                        kind: symbol.kind,
                        tags: [],
                        range: this.p2m.asRange(symbol.range),
                        selectionRange: this.p2m.asRange(symbol.selectionRange),
                        children: symbol.children.map(toSymbol),
                    });
                    return (await target.api.symbols(target)).map(toSymbol);
                }),
            }),
            languages.registerDocumentHighlightProvider(SELECTOR, {
                provideDocumentHighlights: (model, position) => this.ask(model, async target => {
                    const highlights = await target.api.documentHighlights(this.at(target, position));
                    return highlights.flatMap(highlight => {
                        const range = this.rangeOf(model, highlight);
                        return range ? [{ range, kind: highlight.kind }] : [];
                    });
                }),
            }),
            languages.registerFoldingRangeProvider(SELECTOR, {
                // Host folding lines are zero-based, Monaco's one-based.
                provideFoldingRanges: model => this.ask(model, async target =>
                    (await target.api.foldingRanges(target)).map(({ start, end, kind }) => ({
                        start: start + 1,
                        end: end + 1,
                        kind: kind ? languages.FoldingRangeKind.fromValue(kind) : undefined,
                    }))),
            }),
            languages.registerSelectionRangeProvider(SELECTOR, {
                provideSelectionRanges: (model, positions) => this.ask(model, target => Promise.all(positions.map(async position =>
                    (await target.api.selectionRanges(this.at(target, position))).flatMap(item => {
                        const range = this.rangeOf(model, item);
                        return range ? [{ range }] : [];
                    })))),
            }),
            languages.registerCodeActionProvider(SELECTOR, {
                provideCodeActions: (model, range, context) => this.ask(model, async target => {
                    const document: DocumentRef = { resourceId: target.resourceId, language: target.language, revision: target.revision };
                    const actions = await target.api.codeActions(document, this.m2p.asRange(range), context.only);
                    return {
                        actions: actions.map(action => ({
                            title: action.title,
                            kind: action.kind,
                            isPreferred: action.isPreferred,
                            disabled: typeof action.disabled === 'object' ? action.disabled.reason : action.disabled ?? action.plan_error,
                            command: { id: APPLY_CODE_ACTION.id, title: action.title, arguments: [document, action] },
                        })),
                        dispose: () => undefined,
                    };
                }),
            }),
            languages.registerDocumentFormattingEditProvider(SELECTOR, {
                displayName: 'Theorem',
                provideDocumentFormattingEdits: async model => {
                    await this.act(model, 'Format', async target => this.apply(target.api, await target.api.format(target)));
                    return [];
                },
            }),
            languages.registerRenameProvider(SELECTOR, {
                resolveRenameLocation: (model, position) => this.ask(model, async target => {
                    const found = await target.api.prepareRename(this.at(target, position));
                    const word = model.getWordAtPosition(position);
                    const range = found.range
                        ? this.p2m.asRange(found.range)
                        : new monaco.Range(position.lineNumber, word?.startColumn ?? position.column, position.lineNumber, word?.endColumn ?? position.column);
                    return { range, text: found.placeholder ?? model.getValueInRange(range), rejectReason: found.rejectReason };
                }),
                provideRenameEdits: async (model, position, newName) => {
                    await this.act(model, 'Rename', async target =>
                        this.apply(target.api, await target.api.rename(this.at(target, position), newName), 'The language host proposed no rename.'));
                    return { edits: [] };
                },
            }),
        ]);
    }

    onStop(): void {
        this.toDispose.dispose();
    }

    /**
     * Run a request about `model`'s document once its pending edits are sent.
     * A failed request reads as no answer, as when no provider handles the language.
     */
    protected async ask<T>(model: monaco.editor.ITextModel, run: (target: Target) => Promise<T>): Promise<T | undefined> {
        try {
            const target = await this.target(model);
            return target && await run(target);
        } catch (error) {
            this.logger.debug(`Language request for ${model.uri.toString()} failed`, error);
            return undefined;
        }
    }

    /** Like `ask`, for an action the person asked for: a failure is shown to them. */
    protected act(model: monaco.editor.ITextModel, title: string, run: (target: Target) => Promise<void>): Promise<void> {
        return this.perform(title, async () => {
            const target = await this.target(model);
            if (target) {
                await run(target);
            }
        });
    }

    protected async perform(title: string, run: () => Promise<void>): Promise<void> {
        try {
            await run();
        } catch (error) {
            this.messages.error(`${title} failed: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    protected async target(model: monaco.editor.ITextModel): Promise<Target | undefined> {
        const resourceId = this.connection.toPath(new URI(model.uri.toString()));
        if (!resourceId) {
            return undefined;
        }
        const lease = await this.connection.acquire(resourceId);
        let revision: number;
        try {
            await lease.session.flushed();
            revision = lease.session.revision;
        } finally {
            lease.release();
        }
        return { api: await this.connection.language(), resourceId, language: languageOf(model), revision };
    }

    protected at(target: Target, position: monaco.IPosition): DocumentPosition {
        return { resourceId: target.resourceId, language: target.language, revision: target.revision, ...this.m2p.asPosition(position.lineNumber, position.column) };
    }

    /** A plan applies through the authority; with no plan there is nothing to change, unless `missing` says otherwise. */
    protected async apply(api: WorkspaceLanguage, plan: LanguagePlan, missing?: string): Promise<void> {
        if (plan.plan_id) {
            await api.applyPlan(plan.plan_id);
        } else if (missing) {
            throw new Error(missing);
        }
    }

    protected rangeOf(model: monaco.editor.ITextModel, item: Ranged): monaco.Range | undefined {
        const range = rangeIn(model.getValue(), item);
        return range && this.p2m.asRange(range);
    }

    protected suggestion(item: LanguageCompletionItem, position: DocumentPosition, fallback: monaco.IRange): monaco.languages.CompletionItem {
        const { range } = item;
        const suggestion: monaco.languages.CompletionItem = {
            label: item.label,
            kind: item.kind ?? monaco.languages.CompletionItemKind.Text,
            detail: item.detail ?? undefined,
            documentation: markdown(item.documentation),
            insertText: item.insertText ?? item.label,
            range: !range
                ? fallback
                : 'inserting' in range
                    ? { insert: this.p2m.asRange(range.inserting), replace: this.p2m.asRange(range.replacing) }
                    : this.p2m.asRange(range),
        };
        this.completions.set(suggestion, { position, item });
        return suggestion;
    }

    protected async resolveCompletion(suggestion: monaco.languages.CompletionItem): Promise<monaco.languages.CompletionItem> {
        const source = this.completions.get(suggestion);
        if (!source?.item.item_id) {
            return suggestion;
        }
        try {
            const resolved = await (await this.connection.language()).resolveCompletion(source.position, source.item);
            if (resolved) {
                suggestion.detail = resolved.detail ?? suggestion.detail;
                suggestion.documentation = markdown(resolved.documentation) ?? suggestion.documentation;
            }
        } catch (error) {
            this.logger.debug(`Resolving completion ${source.item.label} failed`, error);
        }
        return suggestion;
    }

    /** Monaco locations of host results; spans in other documents are read against those documents' text. */
    protected async locations(found: LanguageLocation[]): Promise<monaco.languages.Location[]> {
        const texts = new Map<string, Promise<string>>();
        const textOf = (uri: URI) => {
            const key = uri.toString();
            let text = texts.get(key);
            if (!text) {
                const open = monaco.editor.getModel(monaco.Uri.parse(key));
                text = open ? Promise.resolve(open.getValue()) : this.files.read(uri).then(content => content.value);
                texts.set(key, text);
            }
            return text;
        };
        return Promise.all(found.map(async location => {
            if (isDocumentSpan(location)) {
                const uri = this.connection.toUri(location.document.resource_id);
                const range = rangeIn(await textOf(uri), { location })!;
                return this.p2m.asLocation({ uri: uri.toString(), range });
            }
            return this.p2m.asLocation({ uri: this.workspaceUri(location.uri).toString(), range: location.range });
        }));
    }

    /** A host file URI: as given inside the workspace root, else its path read as a workspace path. */
    protected workspaceUri(raw: string): URI {
        const uri = new URI(raw);
        return this.connection.toPath(uri) !== undefined ? uri : this.connection.toUri(uri.path.toString().replace(/^\/+/, ''));
    }
}
