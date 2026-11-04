import { describe, expect, test } from 'bun:test';
import { blameText, hunkAt, type BlameHunk } from './blame-hunks';

const hunk = (start_line: number, line_count: number, overrides: Partial<BlameHunk> = {}): BlameHunk => ({
    author: 'Ada',
    commit: 'abc123',
    line_count,
    start_line,
    summary: 'fix the thing',
    timestamp: '1000',
    ...overrides,
});

describe('hunkAt', () => {
    const hunks = [hunk(1, 2), hunk(3, 1, { author: 'Grace' })];

    test('finds the hunk holding a line', () => {
        expect(hunkAt(hunks, 2)?.author).toBe('Ada');
        expect(hunkAt(hunks, 3)?.author).toBe('Grace');
    });

    test('finds nothing past the last hunk', () => {
        expect(hunkAt(hunks, 4)).toBeUndefined();
    });
});

describe('blameText', () => {
    test('names the author, age and summary', () => {
        expect(blameText(hunk(1, 1), 1000 + 3 * 86_400)).toBe('Ada, 3 days ago · fix the thing');
    });

    test('calls a very recent commit just now', () => {
        expect(blameText(hunk(1, 1), 1010)).toBe('Ada, just now · fix the thing');
    });

    test('says when a line is not committed', () => {
        expect(blameText(hunk(1, 1, { commit: '0000000000' }))).toBe('Not committed yet');
    });
});
