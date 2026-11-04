// SOURCING: @theia/callhierarchy is the view and its commands; the host's `navigation.hierarchy` asks
// the language server. Only the mapping between the two shapes is written here.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { CancellationToken } from '@theia/core';
import URI from '@theia/core/lib/common/uri';
import type { Position, Range, SymbolKind } from '@theia/core/shared/vscode-languageserver-protocol';
import { CallHierarchyIncomingCall, CallHierarchyItem, CallHierarchyOutgoingCall } from '@theia/callhierarchy/lib/browser/callhierarchy';
import { CallHierarchyService, CallHierarchySession } from '@theia/callhierarchy/lib/browser/callhierarchy-service';
import { TheoremConnection } from './theorem-connection';

/** A row of `navigation.hierarchy`: the symbol asked about, with its callers or callees as children. */
interface HierarchyNode {
    name: string;
    kind: SymbolKind;
    detail?: string;
    uri: string;
    range: Range;
    selectionRange: Range;
    fromRanges: Range[];
    children: HierarchyNode[];
}

/** Callers and callees through the workspace's language host. */
@injectable()
export class TheoremCallHierarchy implements CallHierarchyService {

    readonly selector = { scheme: 'file' };

    @inject(TheoremConnection) protected readonly connection: TheoremConnection;

    async getRootDefinition(uri: string, position: Position, _token: CancellationToken): Promise<CallHierarchySession | undefined> {
        const path = this.connection.toPath(new URI(uri));
        if (!path) {
            return undefined;
        }
        const nodes = await this.ask(path, position, 'incoming');
        const items = await Promise.all(nodes.map(node => this.item(node, path)));
        return { items: items.filter((item): item is CallHierarchyItem => !!item), dispose: () => undefined };
    }

    async getCallers(definition: CallHierarchyItem, _token: CancellationToken): Promise<CallHierarchyIncomingCall[]> {
        return (await this.calls(definition, 'incoming')).map(({ item, fromRanges }) => ({ from: item, fromRanges }));
    }

    async getCallees(definition: CallHierarchyItem, _token: CancellationToken): Promise<CallHierarchyOutgoingCall[]> {
        return (await this.calls(definition, 'outgoing')).map(({ item, fromRanges }) => ({ to: item, fromRanges }));
    }

    protected async calls(definition: CallHierarchyItem, direction: 'incoming' | 'outgoing'): Promise<{ item: CallHierarchyItem; fromRanges: Range[] }[]> {
        const path = this.connection.toPath(URI.fromComponents(definition.uri));
        if (!path) {
            return [];
        }
        const nodes = await this.ask(path, definition.selectionRange.start, direction);
        const calls = await Promise.all(nodes.flatMap(node => node.children).map(async child => {
            const item = await this.item(child, path);
            return item && { item, fromRanges: child.fromRanges };
        }));
        return calls.filter(call => !!call);
    }

    /** The host answers for the revision it is told of, so the document is seated and its edits sent first. */
    protected async ask(path: string, position: Position, direction: 'incoming' | 'outgoing'): Promise<HierarchyNode[]> {
        const lease = await this.connection.acquire(path);
        let revision: number;
        try {
            await lease.session.flushed();
            revision = lease.session.revision;
        } finally {
            lease.release();
        }
        const { nodes } = await this.connection.operate<{ nodes?: HierarchyNode[] }>('navigation.hierarchy', {
            resource_id: path,
            revision,
            line: position.line,
            character: position.character,
            kind: 'call',
            direction,
        });
        return nodes ?? [];
    }

    /** Leaves out symbols beyond the workspace, such as a standard library's. */
    protected async item(node: HierarchyNode, resourceId: string): Promise<CallHierarchyItem | undefined> {
        const uri = await this.connection.fromHostUri(node.uri, resourceId);
        return uri && {
            kind: node.kind,
            name: node.name,
            detail: node.detail,
            uri: uri.toComponents(),
            range: node.range,
            selectionRange: node.selectionRange,
        };
    }
}
