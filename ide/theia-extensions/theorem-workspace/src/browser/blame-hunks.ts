// SOURCING: none — `scm.blame` hunks reshaped for one line of text; git does the blaming on the host.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** A run of lines one commit last touched; `start_line` counts from 1 and `timestamp` is in seconds. */
export interface BlameHunk {
    author: string;
    commit: string;
    line_count: number;
    start_line: number;
    summary: string;
    timestamp: string | number;
}

export function hunkAt(hunks: readonly BlameHunk[], line: number): BlameHunk | undefined {
    return hunks.find(hunk => line >= hunk.start_line && line < hunk.start_line + hunk.line_count);
}

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 31_536_000], ['month', 2_592_000], ['week', 604_800], ['day', 86_400], ['hour', 3_600], ['minute', 60],
];
const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

function ago(seconds: number, now: number): string {
    const elapsed = now - seconds;
    for (const [unit, size] of UNITS) {
        if (elapsed >= size) {
            return relative.format(-Math.floor(elapsed / size), unit);
        }
    }
    return 'just now';
}

/** The text shown after a line: who, when and why. Git marks lines not yet committed with a zero hash. */
export function blameText(hunk: BlameHunk, now = Date.now() / 1000): string {
    if (/^0+$/.test(hunk.commit)) {
        return 'Not committed yet';
    }
    return `${hunk.author}, ${ago(Number(hunk.timestamp), now)} · ${hunk.summary}`;
}
