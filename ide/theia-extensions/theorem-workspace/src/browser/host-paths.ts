// SOURCING: none — the WHATWG URL parser reads the URI; only the prefix rule below is the host's own.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * The workspace path of a `file:` URI a language server answered with. Servers
 * run beside the checkout and name files by their absolute paths on the host,
 * while the frame names them under its own root. Undefined outside `roots`, such
 * as a toolchain's standard library, which the frame has no way to open.
 */
export function workspacePathOf(raw: string, roots: readonly string[]): string | undefined {
    let path: string;
    try {
        path = decodeURIComponent(new URL(raw).pathname);
    } catch {
        return undefined;
    }
    for (const root of roots) {
        const base = root.replace(/\/+$/, '');
        if (path === base) {
            return '';
        }
        if (path.startsWith(`${base}/`)) {
            return path.slice(base.length + 1);
        }
    }
    return undefined;
}
