// SOURCING: none — the order of the host's copy, rename and delete that keeps a target until its replacement exists.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

export interface EntryMoves {
    /** Copy the source to a path that does not exist yet. */
    copyTo(path: string): Promise<void>;
    rename(from: string, to: string): Promise<void>;
    remove(path: string): Promise<void>;
}

/**
 * Replace `target` with a copy of the source. The host only copies to a free
 * path and cannot rename over a directory, so the copy is made beside the target
 * and swapped in; any failure leaves the target as it was.
 */
export async function replaceWithCopy(target: string, moves: EntryMoves, unique: () => string = () => crypto.randomUUID()): Promise<void> {
    const id = unique();
    const copied = `${target}.${id}.copy`;
    const replaced = `${target}.${id}.replaced`;
    await moves.copyTo(copied);
    try {
        await moves.rename(target, replaced);
    } catch (error) {
        await moves.remove(copied).catch(() => undefined);
        throw error;
    }
    try {
        await moves.rename(copied, target);
    } catch (error) {
        await moves.rename(replaced, target).catch(() => undefined);
        await moves.remove(copied).catch(() => undefined);
        throw error;
    }
    await moves.remove(replaced);
}
