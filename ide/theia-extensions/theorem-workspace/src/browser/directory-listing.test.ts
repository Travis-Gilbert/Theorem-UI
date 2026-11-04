import { describe, expect, test } from 'bun:test';
import { childrenOf, type DirectoryListing } from './directory-listing';

const WHOLE_TREE: DirectoryListing = {
    directories: [{ path: 'src', kind: 'directory' }, { path: 'src/deep', kind: 'directory' }],
    files: [
        { path: 'main.ts', kind: 'file' },
        { path: 'src/deep/a.txt', kind: 'file' },
        { path: 'src2/b.txt', kind: 'file' },
    ],
};

describe('childrenOf', () => {
    test('takes per-directory entries as answered', () => {
        const entries = [{ name: 'a.txt', kind: 'file' }];
        expect(childrenOf({ entries, files: [] }, 'src')).toEqual(entries);
    });

    test('reads the root out of a whole-tree answer', () => {
        expect(childrenOf(WHOLE_TREE, '')).toEqual([
            { name: 'src', kind: 'directory' },
            { name: 'main.ts', kind: 'file' },
            { name: 'src2', kind: 'directory' },
        ]);
    });

    test('reads a directory out of a whole-tree answer, not its namesakes', () => {
        expect(childrenOf(WHOLE_TREE, 'src')).toEqual([{ name: 'deep', kind: 'directory' }]);
    });

    test('reads an empty answer as no children', () => {
        expect(childrenOf({}, 'src')).toEqual([]);
    });
});
