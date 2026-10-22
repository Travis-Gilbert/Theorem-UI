// SOURCING: none — bun:test spec for the theme converter.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { describe, expect, test } from 'bun:test';
import { convertZedTheme, ZedThemeFamily } from './zed-theme-converter';
import one from './themes/one/one.json';
import ayu from './themes/ayu/ayu.json';
import gruvbox from './themes/gruvbox/gruvbox.json';

const themes = ([one, ayu, gruvbox] as ZedThemeFamily[]).flatMap(family => family.themes);

describe('convertZedTheme', () => {
    test('converts every bundled theme with unique ids', () => {
        const ids = themes.map(theme => convertZedTheme(theme).id);
        expect(ids).toContain('zed-one-dark');
        expect(ids).toContain('zed-gruvbox-light-soft');
        expect(new Set(ids).size).toBe(themes.length);
    });

    test('maps workbench, player and terminal colors from One Dark', () => {
        const { json, uiTheme, label } = convertZedTheme(one.themes[0] as ZedThemeFamily['themes'][number]);
        expect(label).toBe('One Dark (Zed)');
        expect(uiTheme).toBe('vs-dark');
        expect(json.colors['editor.background']).toBe('#282c33ff');
        expect(json.colors['tab.activeBackground']).toBe('#282c33ff');
        expect(json.colors['statusBar.background']).toBe('#3b414dff');
        expect(json.colors['editorCursor.foreground']).toBe('#74ade8ff');
        expect(json.colors['terminal.ansiBrightRed']).toBe('#EA858Bff');
    });

    test('light themes use the light base', () => {
        expect(convertZedTheme(one.themes[1] as ZedThemeFamily['themes'][number]).uiTheme).toBe('vs');
    });

    test('emits only hex colors and assigns each scope once', () => {
        for (const theme of themes) {
            const { json } = convertZedTheme(theme);
            const values = [...Object.values(json.colors), ...json.tokenColors.flatMap(rule => Object.values(rule.settings))];
            for (const value of values) {
                expect(value).toMatch(/^(#[0-9a-fA-F]{3,8}|italic|bold|italic bold)$/);
            }
            const scopes = json.tokenColors.flatMap(rule => rule.scope);
            expect(new Set(scopes).size).toBe(scopes.length);
        }
    });

    test('carries syntax colors and font styles', () => {
        const { json } = convertZedTheme(one.themes[0] as ZedThemeFamily['themes'][number]);
        const rule = (name: string) => json.tokenColors.find(r => r.name === name);
        expect(rule('keyword')?.settings.foreground).toBe('#b477cfff');
        expect(rule('keyword')?.scope).toContain('storage.type');
        expect(rule('function')?.scope).toContain('method');
        expect(rule('link_text')?.settings.fontStyle).toBe('italic');
        expect(rule('emphasis.strong')?.settings.fontStyle).toBe('bold');
    });
});
