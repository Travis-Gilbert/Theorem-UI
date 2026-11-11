// SOURCING: @theoremharness/sdk scalarToUtf16 converts the host's columns; this file only reshapes
// `search.query` rows for Theia's search view. Free of Theia imports so its tests run outside the
// workbench.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { scalarToUtf16 } from '@theoremharness/sdk';

/** A `search.query` text row: 1-based `line`, `ranges` in scalars within `text`, `text_offset` the scalars cut before it. */
export interface TextRow {
    kind: 'text';
    path: string;
    line: number;
    text: string;
    ranges: { start: number; end: number }[];
    text_offset?: number;
}

export interface QueryAnswer {
    id: string;
    complete: boolean;
    cancelled: boolean;
    results: (TextRow | { kind: string })[];
}

export interface RowMatch {
    line: number;
    character: number;
    length: number;
    lineText: string | { text: string; character: number };
}

/**
 * One row's matches as Theia's search view reads them: one-based columns in UTF-16. A line the host
 * cut before the match shows as a preview, with the match's place in that preview. The cut part's
 * length is only known in scalars, so a match after an astral character in the cut part is short by
 * one column per such character.
 */
export function rowMatches(row: TextRow): RowMatch[] {
    return row.ranges.map(({ start, end }) => {
        const from = scalarToUtf16(row.text, start);
        const length = scalarToUtf16(row.text, end) - from;
        const cut = row.text_offset ?? 0;
        return {
            line: row.line,
            character: from + cut + 1,
            length,
            lineText: cut > 0 ? { text: row.text, character: from + 1 } : row.text,
        };
    });
}

/** The text rows of one answer by path, in the host's order. */
export function matchesByPath(results: QueryAnswer['results']): Map<string, RowMatch[]> {
    const byPath = new Map<string, RowMatch[]>();
    for (const row of results) {
        if (row.kind !== 'text') {
            continue;
        }
        const text = row as TextRow;
        const matches = byPath.get(text.path) ?? [];
        matches.push(...rowMatches(text));
        byPath.set(text.path, matches);
    }
    return byPath;
}
