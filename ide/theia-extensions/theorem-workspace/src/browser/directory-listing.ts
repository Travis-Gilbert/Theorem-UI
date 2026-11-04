// SOURCING: none — reads the two shapes of the host's `workspace.files.list` into one list of children.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * `workspace.files.list`: a host with per-directory listing answers `entries`
 * for the path it was asked about; one without ignores the path and answers
 * the whole tree, minus its excludes, as `files` and `directories`.
 */
export interface DirectoryListing {
    entries?: { name: string; kind: string }[];
    files?: { path: string; kind: string }[];
    directories?: { path: string; kind: string }[];
}

/** The name and kind of each direct child of `path`; `''` is the workspace root. */
export function childrenOf(listing: DirectoryListing, path: string): { name: string; kind: string }[] {
    if (listing.entries) {
        return listing.entries;
    }
    const prefix = path ? `${path}/` : '';
    const children = new Map<string, string>();
    for (const row of [...(listing.directories ?? []), ...(listing.files ?? [])]) {
        if (!row.path.startsWith(prefix)) {
            continue;
        }
        const rest = row.path.slice(prefix.length);
        const slash = rest.indexOf('/');
        if (slash === -1) {
            children.set(rest, row.kind);
        } else {
            children.set(rest.slice(0, slash), 'directory');
        }
    }
    return [...children].map(([name, kind]) => ({ name, kind }));
}
