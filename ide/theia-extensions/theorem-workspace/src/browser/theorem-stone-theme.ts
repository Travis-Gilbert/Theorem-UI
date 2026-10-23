// SOURCING: @theia/monaco MonacoThemingService.registerParsedTheme (VS Code color themes, with VS Code's
// `include` to inherit GitHub's syntax colours) and @theia/core ColorContribution (the sheet's colours as
// contributed theme colours, as a VS Code extension's `contributes.colors`). Only the values are ours.
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

export const STONE_THEMES = { light: 'theorem-stone-light', dark: 'theorem-stone-dark' };

/**
 * The Theorem UI's Stone look (src/styles.css) as Theia colour themes. Chrome takes the UI's tokens and
 * is transparent wherever the UI shows the sheet; code takes the GitHub themes the UI highlights chat
 * code with. style/stone.css paints the sheet behind the shell from the `theoremSheet.*` colours.
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
