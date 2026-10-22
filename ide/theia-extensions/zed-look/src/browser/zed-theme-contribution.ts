// SOURCING: @theia/monaco MonacoThemingService.registerParsedTheme — themes go through Theia's own registry.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { inject, injectable } from '@theia/core/shared/inversify';
import { FrontendApplicationContribution } from '@theia/core/lib/browser';
import { MonacoThemingService } from '@theia/monaco/lib/browser/monaco-theming-service';
import { convertZedTheme, ZedThemeFamily } from './zed-theme-converter';
import * as one from './themes/one/one.json';
import * as ayu from './themes/ayu/ayu.json';
import * as gruvbox from './themes/gruvbox/gruvbox.json';

/** Registers Zed's bundled theme families (vendored from the Zed repository's `assets/themes`). */
@injectable()
export class ZedThemeContribution implements FrontendApplicationContribution {

    @inject(MonacoThemingService)
    protected readonly theming: MonacoThemingService;

    initialize(): void {
        for (const family of [one, ayu, gruvbox] as ZedThemeFamily[]) {
            for (const theme of family.themes) {
                this.theming.registerParsedTheme(convertZedTheme(theme));
            }
        }
    }
}
