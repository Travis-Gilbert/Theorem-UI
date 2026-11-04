// SOURCING: none — Monaco keeps one line ending per model, so a file with mixed endings, or another
// writer's `\n` in a CRLF file, leaves the model's offsets apart from the shared document's. Lines
// and columns agree whatever the endings are; this file converts through them. Free of Theia imports
// so its tests run outside the workbench.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Where each line of `text` starts: `\r\n`, `\n` and a lone `\r` each end a line, as in Monaco. */
export function lineStarts(text: string): number[] {
    const starts = [0];
    for (let at = 0; at < text.length; at++) {
        const code = text.charCodeAt(at);
        if (code === 13 && text.charCodeAt(at + 1) === 10) {
            at += 1;
            starts.push(at + 1);
        } else if (code === 10 || code === 13) {
            starts.push(at + 1);
        }
    }
    return starts;
}

/** The offset of a one-based line and column, as Monaco counts them. */
export function offsetAt(text: string, starts: number[], lineNumber: number, column: number): number {
    const start = starts[Math.min(lineNumber, starts.length) - 1];
    return Math.min(start + column - 1, text.length);
}

interface ModelChange {
    range: { startLineNumber: number; startColumn: number; endLineNumber: number; endColumn: number };
    text: string;
}

/** Monaco's changes as changes to `text`, the document they were made against. */
export function changesAgainst(text: string, changes: readonly ModelChange[]): { start: number; end: number; insert: string }[] {
    const starts = lineStarts(text);
    return changes.map(({ range, text: insert }) => ({
        start: offsetAt(text, starts, range.startLineNumber, range.startColumn),
        end: offsetAt(text, starts, range.endLineNumber, range.endColumn),
        insert,
    }));
}

/** `text` with every line ending as `eol`: what a Monaco model holds for it. */
export const withLineEnding = (text: string, eol: string): string => text.replace(/\r\n|\r|\n/g, eol);
