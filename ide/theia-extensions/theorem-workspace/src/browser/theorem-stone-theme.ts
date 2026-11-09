// SOURCING: @theia/monaco MonacoThemingService.registerParsedTheme (VS Code color themes, with VS Code's
// `include` to inherit GitHub's syntax colours, or Anthony Fu's Vitesse themes for the Vitesse palette) and
// @theia/core ColorContribution (the sheet's colours as contributed theme colours, as a VS Code
// extension's `contributes.colors`). Only the values are ours.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { ColorContribution } from '@theia/core/lib/browser/color-application-contribution';
import { ColorRegistry } from '@theia/core/lib/browser/color-registry';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import * as githubLight from './themes/github/github-light-default.json';
import * as githubDark from './themes/github/github-dark-default.json';
import * as stoneLight from './themes/stone/theorem-stone-light.json';
import * as stoneDark from './themes/stone/theorem-stone-dark.json';
import * as vitesseLight from './themes/vitesse/vitesse-light.json';
import * as vitesseDarkSoft from './themes/vitesse/vitesse-dark-soft.json';
import * as theoremVitesseLight from './themes/vitesse/theorem-vitesse-light.json';
import * as theoremVitesseDark from './themes/vitesse/theorem-vitesse-dark.json';

export const STONE_THEMES = { light: 'theorem-stone-light', dark: 'theorem-stone-dark' };
export const VITESSE_THEMES = { light: 'theorem-vitesse-light', dark: 'theorem-vitesse-dark' };

/** The light and dark themes for one of the Theorem UI's palettes; Stone's for any without its own. */
export function themesForPalette(palette?: string): { light: string; dark: string } {
    return palette === 'vitesse' ? VITESSE_THEMES : STONE_THEMES;
}

/**
 * The Theorem UI's Stone look (src/styles.css) as Theia colour themes. Chrome takes the UI's tokens and
 * is transparent wherever the UI shows the sheet; code takes the GitHub themes the UI highlights chat
 * code with. style/stone.css paints the sheet behind the shell from the `theoremSheet.*` colours.
 * The Vitesse palette's pair takes Fu's Vitesse themes whole and only clears the same chrome.
 */
@injectable()
export class TheoremStoneTheme implements FrontendApplicationContribution, ColorContribution {

    @inject(MonacoThemingService) protected readonly theming: MonacoThemingService;

    initialize(): void {
        this.theming.registerParsedTheme({
            id: STONE_THEMES.light, label: stoneLight.name, uiTheme: 'vs', json: stoneLight,
            includes: { [stoneLight.include]: githubLight }
        });
        this.theming.registerParsedTheme({
            id: STONE_THEMES.dark, label: stoneDark.name, uiTheme: 'vs-dark', json: stoneDark,
            includes: { [stoneDark.include]: githubDark }
        });
        this.theming.registerParsedTheme({
            id: VITESSE_THEMES.light, label: theoremVitesseLight.name, uiTheme: 'vs', json: theoremVitesseLight,
            includes: { [theoremVitesseLight.include]: vitesseLight }
        });
        this.theming.registerParsedTheme({
            id: VITESSE_THEMES.dark, label: theoremVitesseDark.name, uiTheme: 'vs-dark', json: theoremVitesseDark,
            includes: { [theoremVitesseDark.include]: vitesseDarkSoft }
        });
    }

    /** Every other theme gets its editor background here, which leaves it looking as before. */
    registerColors(colors: ColorRegistry): void {
        colors.register(
            { id: 'theoremSheet.top', defaults: 'editor.background', description: 'Top of the sheet painted behind the workbench.' },
            { id: 'theoremSheet.bottom', defaults: 'editor.background', description: 'Bottom of the sheet painted behind the workbench.' },
            {
                id: 'theoremSheet.editorBackground', defaults: 'editor.background',
                description: 'What editors paint over the sheet; transparent lets the sheet show through.'
            }
        );
    }
}
