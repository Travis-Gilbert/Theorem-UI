import { describe, expect, test } from 'bun:test';
import { DEFAULT_PROFILE_ID, herdrReady, openBody, partitionProfiles, profileById, TERMINAL_PROFILES } from './terminal-profile';

describe('terminal profiles', () => {
    test('a native terminal sends only its size, as hosts without backends expect', () => {
        expect(openBody(profileById('Shell'), 80, 24)).toEqual({ cols: 80, rows: 24 });
        expect(openBody(undefined, 100, 30)).toEqual({ cols: 100, rows: 30 });
    });

    test('a Herdr shell names its backend and lets the host pick the shell', () => {
        expect(openBody(profileById('Herdr shell'), 80, 24)).toEqual({ cols: 80, rows: 24, backend: 'herdr' });
    });

    test('an agent profile sends its program on the Herdr backend', () => {
        expect(openBody(profileById('Claude Code (Herdr)'), 120, 40)).toEqual({
            cols: 120,
            rows: 40,
            backend: 'herdr',
            argv: ['claude'],
        });
        expect(openBody(profileById('Codex (Herdr)'), 80, 24)).toMatchObject({ argv: ['codex'] });
    });

    test('the body does not share the profile table', () => {
        const body = openBody(profileById('Claude Code (Herdr)'), 80, 24);
        (body.argv as string[]).push('--danger');
        expect(profileById('Claude Code (Herdr)')?.argv).toEqual(['claude']);
    });

    test('Herdr profiles wait for the host to report a reachable core', () => {
        expect(herdrReady({ backends: { native: { ready: true }, herdr: { ready: true, version: '0.1.17' } } })).toBe(true);
        expect(herdrReady({ backends: { herdr: { ready: false, reason: 'hc not found' } } })).toBe(false);
        // A host without backends predates Herdr and would open a native shell instead.
        expect(herdrReady({ operations: [] })).toBe(false);
        expect(herdrReady(undefined)).toBe(false);
        expect(herdrReady({ backends: { herdr: { ready: 'true' } } })).toBe(false);
    });

    test('native profiles are offered apart from the Herdr ones', () => {
        const [native, herdr] = partitionProfiles(TERMINAL_PROFILES);
        expect(native.map(profile => profile.id)).toEqual(['Shell']);
        expect(herdr.map(profile => profile.id)).toEqual(['Herdr shell', 'Claude Code (Herdr)', 'Codex (Herdr)']);
    });

    test('profile ids are unique and the default exists', () => {
        const ids = TERMINAL_PROFILES.map(profile => profile.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(profileById(DEFAULT_PROFILE_ID)?.backend).toBe('native');
        expect(profileById('missing')).toBeUndefined();
    });
});
