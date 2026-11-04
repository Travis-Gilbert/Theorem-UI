import { describe, expect, test } from 'bun:test';
import { workspacePathOf } from './host-paths';

const ROOTS = ['/srv/state/my workspace/checkout'];

describe('workspacePathOf', () => {
    test('reads a path under a root, decoding the URI', () => {
        expect(workspacePathOf('file:///srv/state/my%20workspace/checkout/src/main.rs', ROOTS)).toBe('src/main.rs');
    });

    test('reads the root itself as the empty path', () => {
        expect(workspacePathOf('file:///srv/state/my%20workspace/checkout', ROOTS)).toBe('');
    });

    test('ignores a trailing slash on the root', () => {
        expect(workspacePathOf('file:///a/b.rs', ['/a/'])).toBe('b.rs');
    });

    test('does not take a sibling that shares the prefix', () => {
        expect(workspacePathOf('file:///srv/state/my%20workspace/checkout2/a.rs', ROOTS)).toBeUndefined();
    });

    test('leaves out files beyond the roots, such as a standard library', () => {
        expect(workspacePathOf('file:///home/me/.rustup/toolchains/stable/lib/rustlib/src/lib.rs', ROOTS)).toBeUndefined();
    });

    test('reads nothing from what is not a URI', () => {
        expect(workspacePathOf('src/main.rs', ROOTS)).toBeUndefined();
    });
});
