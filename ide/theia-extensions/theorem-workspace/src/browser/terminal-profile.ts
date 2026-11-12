// SOURCING: none — the host's `terminal.open` arguments (`backend`, `argv`, `name`) and its
// workspace capabilities reply, as apps/theorem-ide-host defines them. Free of Theia imports so its
// tests run outside the workbench.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/** Which host terminal backend runs the program. `native` is the host's own PTY. */
export type TerminalBackend = 'native' | 'herdr';

/**
 * A terminal the workspace host can start: what runs, and which backend owns its process. Theia's
 * profile picker shows the id, so the id is also the title.
 */
export interface TheoremTerminalProfile {
    id: string;
    backend: TerminalBackend;
    /** The program and its arguments. Absent: the host machine's shell. */
    argv?: readonly string[];
}

/**
 * The terminals the IDE offers. Herdr-backed terminals live in herdr-core on the host, so they
 * survive a host restart and show in `hc ls` there; native terminals end with the host.
 */
export const TERMINAL_PROFILES: readonly TheoremTerminalProfile[] = [
    { id: 'Shell', backend: 'native' },
    { id: 'Herdr shell', backend: 'herdr' },
    { id: 'Claude Code (Herdr)', backend: 'herdr', argv: ['claude'] },
    { id: 'Codex (Herdr)', backend: 'herdr', argv: ['codex'] },
];

export const DEFAULT_PROFILE_ID = 'Shell';

/**
 * Whether a workspace capabilities reply says the host can start Herdr terminals now. The host
 * reports `backends.herdr.ready` only for a core it can reach; older hosts report no backends, and
 * would silently start a native shell for a Herdr request, so absence means not ready.
 */
export function herdrReady(capabilities: unknown): boolean {
    const backends = (capabilities as { backends?: { herdr?: { ready?: unknown } } } | undefined)?.backends;
    return backends?.herdr?.ready === true;
}

/** Native profiles first, then the Herdr ones, which wait for the host to report Herdr ready. */
export function partitionProfiles(
    profiles: readonly TheoremTerminalProfile[],
): [TheoremTerminalProfile[], TheoremTerminalProfile[]] {
    return [profiles.filter(profile => profile.backend === 'native'), profiles.filter(profile => profile.backend === 'herdr')];
}

export function profileById(id: string | undefined): TheoremTerminalProfile | undefined {
    return TERMINAL_PROFILES.find(profile => profile.id === id);
}

/**
 * The `terminal.open` body for a profile. A native terminal sends only its size, which every host
 * accepts; a Herdr terminal names its backend and program.
 */
export function openBody(profile: TheoremTerminalProfile | undefined, cols: number, rows: number): Record<string, unknown> {
    if (!profile || profile.backend === 'native') {
        return { cols, rows };
    }
    return {
        cols,
        rows,
        backend: profile.backend,
        ...(profile.argv ? { argv: [...profile.argv] } : {}),
    };
}
