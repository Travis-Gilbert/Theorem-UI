// SOURCING: none — bun:test over reshaping the host's search rows
import { describe, expect, test } from 'bun:test';
import { matchesByPath, rowMatches, type TextRow } from './search-rows';

const row = (over: Partial<TextRow>): TextRow => ({
    kind: 'text', path: 'a.ts', line: 3, text: 'needle here', ranges: [{ start: 0, end: 6 }], ...over,
});

describe('rowMatches', () => {
    test('columns are one-based', () => {
        expect(rowMatches(row({}))).toEqual([{ line: 3, character: 1, length: 6, lineText: 'needle here' }]);
    });

    test('scalar columns become UTF-16 past an astral character', () => {
        const [match] = rowMatches(row({ text: '😀 needle', ranges: [{ start: 2, end: 8 }] }));
        expect(match?.character).toBe(4);
        expect(match?.length).toBe(6);
    });

    test('a line cut before the match shows as a preview with both positions', () => {
        const [match] = rowMatches(row({ text: 'needle', text_offset: 500 }));
        expect(match?.character).toBe(501);
        expect(match?.lineText).toEqual({ text: 'needle', character: 1 });
    });

    test('every range on a line is a match', () => {
        expect(rowMatches(row({ ranges: [{ start: 0, end: 1 }, { start: 3, end: 4 }] })).map(m => m.character)).toEqual([1, 4]);
    });
});

describe('matchesByPath', () => {
    test('groups a file\'s rows and skips rows that are not text', () => {
        const byPath = matchesByPath([row({ line: 1 }), { kind: 'file' }, row({ line: 2 }), row({ path: 'b.ts' })]);
        expect([...byPath.keys()]).toEqual(['a.ts', 'b.ts']);
        expect(byPath.get('a.ts')?.map(m => m.line)).toEqual([1, 2]);
    });
});
