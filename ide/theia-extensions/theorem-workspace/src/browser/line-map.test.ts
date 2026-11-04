// SOURCING: none — bun:test over the line-ending conversion between Monaco and the shared document
import { describe, expect, test } from 'bun:test';
import { changesAgainst, lineStarts, offsetAt, withLineEnding } from './line-map';

const apply = (text: string, changes: { start: number; end: number; insert: string }[]) =>
    [...changes].sort((a, b) => b.start - a.start).reduce((out, c) => out.slice(0, c.start) + c.insert + out.slice(c.end), text);

const at = (startLineNumber: number, startColumn: number, endLineNumber = startLineNumber, endColumn = startColumn) =>
    ({ startLineNumber, startColumn, endLineNumber, endColumn });

describe('lineStarts', () => {
    test('counts each kind of line ending once', () => {
        expect(lineStarts('a\r\nb\nc\rd')).toEqual([0, 3, 5, 7]);
        expect(lineStarts('')).toEqual([0]);
        expect(lineStarts('a\n')).toEqual([0, 2]);
    });
});

describe('offsetAt', () => {
    test('a column past the end stops at the end of the text', () => {
        expect(offsetAt('ab', lineStarts('ab'), 1, 99)).toBe(2);
    });
});

describe('changesAgainst', () => {
    test('typing on a later line of a mixed file lands where the person typed', () => {
        const text = 'one\r\ntwo\nthree\n';
        expect(apply(text, changesAgainst(text, [{ range: at(3, 1), text: 'X' }]))).toBe('one\r\ntwo\nXthree\n');
    });

    test('deleting a whole CRLF line break takes both characters', () => {
        const text = 'one\r\ntwo\nthree';
        expect(apply(text, changesAgainst(text, [{ range: at(1, 4, 2, 1), text: '' }]))).toBe('onetwo\nthree');
    });

    test('a change set is read against the text before it, however many changes it holds', () => {
        const text = 'a\r\nb\nc';
        const changes = changesAgainst(text, [{ range: at(3, 1), text: '3' }, { range: at(1, 1), text: '1' }]);
        expect(apply(text, changes)).toBe('1a\r\nb\n3c');
    });

    test('offsets past astral characters count UTF-16 units, as Monaco columns do', () => {
        const text = '😀\r\nb';
        expect(changesAgainst(text, [{ range: at(1, 3), text: '!' }])[0]?.start).toBe(2);
    });
});

describe('withLineEnding', () => {
    test('normalizes to what the model holds', () => {
        expect(withLineEnding('a\r\nb\nc\rd', '\n')).toBe('a\nb\nc\nd');
        expect(withLineEnding('a\nb', '\r\n')).toBe('a\r\nb');
    });
});
