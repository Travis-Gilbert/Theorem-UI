import { describe, expect, test } from 'bun:test';
import { replaceWithCopy, type EntryMoves } from './replace-entry';

/** A file system of path to contents, failing the operations named in `failing`. */
function fakeMoves(failing: string[] = []) {
    const files = new Map([['target', 'old'], ['source', 'new']]);
    const fail = (name: string) => {
        if (failing.includes(name)) {
            throw new Error(name);
        }
    };
    const moves: EntryMoves = {
        copyTo: async path => {
            fail(`copy ${path}`);
            files.set(path, files.get('source')!);
        },
        rename: async (from, to) => {
            fail(`rename ${from} ${to}`);
            files.set(to, files.get(from)!);
            files.delete(from);
        },
        remove: async path => {
            fail(`remove ${path}`);
            files.delete(path);
        },
    };
    return { files, moves };
}

const replace = (moves: EntryMoves) => replaceWithCopy('target', moves, () => 'x');

describe('replaceWithCopy', () => {
    test('leaves the copy at the target and nothing beside it', async () => {
        const { files, moves } = fakeMoves();
        await replace(moves);
        expect(Object.fromEntries(files)).toEqual({ target: 'new', source: 'new' });
    });

    test('keeps the target when the copy fails', async () => {
        const { files, moves } = fakeMoves(['copy target.x.copy']);
        await expect(replace(moves)).rejects.toThrow('copy target.x.copy');
        expect(Object.fromEntries(files)).toEqual({ target: 'old', source: 'new' });
    });

    test('keeps the target and clears the copy when moving the target aside fails', async () => {
        const { files, moves } = fakeMoves(['rename target target.x.replaced']);
        await expect(replace(moves)).rejects.toThrow();
        expect(Object.fromEntries(files)).toEqual({ target: 'old', source: 'new' });
    });

    test('puts the target back when the copy cannot move in', async () => {
        const { files, moves } = fakeMoves(['rename target.x.copy target']);
        await expect(replace(moves)).rejects.toThrow();
        expect(Object.fromEntries(files)).toEqual({ target: 'old', source: 'new' });
    });
});
