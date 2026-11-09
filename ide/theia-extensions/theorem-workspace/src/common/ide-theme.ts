// SOURCING: none — the VS Code colour theme format is what Theia's MonacoThemingService reads, and no
// library maps one design system's tokens onto VS Code's colour ids; the mapping is ours. Kept free of
// Theia imports so the Theorem UI imports the token list and its tests run outside the workbench.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * The Theorem UI's tokens the frame's colour theme is made of (src/styles.css, src/palettes.css), so
 * the frame takes whatever palette and mode the UI shows: a built-in one or a person's own.
 */
export const IDE_TOKENS = [
    'sheet-from', 'sheet-to',
    'ink', 'ink-muted', 'ink-faint',
    'line-control', 'line-separator',
    'popover', 'surface-hover', 'surface-selected',
    'focus', 'redwood', 'redwood-hover', 'on-redwood',
    'error-ink', 'error-container', 'attention', 'ochre-ink', 'ochre-container', 'teal-ink', 'teal-container',
    'term-bg', 'term-ink', 'term-bright',
] as const;
export type IdeToken = (typeof IDE_TOKENS)[number];

/** The UI's look as the frame takes it: whether it is dark, and each token as `#rrggbb`. */
export interface IdeTheme {
    dark: boolean;
    /** The UI's palette (lib/palette's value), which picks the code colours: Vitesse's for Vitesse, GitHub's otherwise. */
    palette?: string;
    tokens: Partial<Record<IdeToken, string>>;
}

/**
 * Where each colour comes from: a token, at an alpha (two hex digits) where it is a tint. `sheet-mid`
 * is halfway down the sheet, what Monaco's opaque editor background stands in for; `shadow` is the
 * ink in a light mode and black in a dark one; `transparent` lets the sheet show through.
 */
type Role = IdeToken | 'sheet-mid' | 'shadow' | 'transparent';
const COLOURS: Record<string, Role | readonly [Role, string]> = {
    'theoremSheet.top': 'sheet-from',
    'theoremSheet.bottom': 'sheet-to',
    'theoremSheet.editorBackground': 'transparent',
    'foreground': 'ink',
    'descriptionForeground': 'ink-muted',
    'disabledForeground': 'ink-faint',
    'errorForeground': 'error-ink',
    'icon.foreground': 'ink-muted',
    'focusBorder': 'focus',
    'widget.border': 'line-separator',
    'widget.shadow': ['shadow', '29'],
    'selection.background': ['focus', '38'],
    'sash.hoverBorder': 'focus',
    'textLink.foreground': 'teal-ink',
    'textLink.activeForeground': 'teal-ink',
    'progressBar.background': 'focus',
    'toolbar.hoverBackground': 'surface-hover',
    'toolbar.activeBackground': 'surface-selected',
    'titleBar.activeBackground': 'transparent',
    'titleBar.inactiveBackground': 'transparent',
    'titleBar.activeForeground': 'ink',
    'titleBar.inactiveForeground': 'ink-muted',
    'titleBar.border': 'line-separator',
    'menubar.selectionBackground': 'surface-hover',
    'menubar.selectionForeground': 'ink',
    'menu.background': 'popover',
    'menu.foreground': 'ink',
    'menu.selectionBackground': 'surface-selected',
    'menu.selectionForeground': 'ink',
    'menu.border': 'line-separator',
    'menu.separatorBackground': 'line-separator',
    'activityBar.background': 'transparent',
    'activityBar.foreground': 'ink',
    'activityBar.inactiveForeground': 'ink-faint',
    'activityBar.border': 'transparent',
    'activityBar.activeBorder': 'transparent',
    'activityBar.activeBackground': 'surface-selected',
    'activityBarBadge.background': 'redwood',
    'activityBarBadge.foreground': 'on-redwood',
    'badge.background': 'surface-selected',
    'badge.foreground': 'ink',
    'sideBar.background': 'transparent',
    'sideBar.foreground': 'ink',
    'sideBar.border': 'line-separator',
    'sideBarTitle.foreground': 'ink-muted',
    'sideBarSectionHeader.background': 'transparent',
    'sideBarSectionHeader.foreground': 'ink',
    'sideBarSectionHeader.border': 'line-separator',
    'list.hoverBackground': 'surface-hover',
    'list.hoverForeground': 'ink',
    'list.activeSelectionBackground': 'surface-selected',
    'list.activeSelectionForeground': 'ink',
    'list.inactiveSelectionBackground': 'surface-selected',
    'list.inactiveSelectionForeground': 'ink',
    'list.focusBackground': 'surface-selected',
    'list.focusForeground': 'ink',
    'list.inactiveFocusBackground': 'transparent',
    'list.focusOutline': 'focus',
    'list.inactiveFocusOutline': 'transparent',
    'list.dropBackground': ['focus', '38'],
    'list.highlightForeground': 'redwood',
    'list.focusHighlightForeground': 'redwood',
    'list.errorForeground': 'error-ink',
    'list.warningForeground': 'ochre-ink',
    'tree.indentGuidesStroke': 'line-separator',
    'editorGroup.border': 'line-separator',
    'editorGroup.dropBackground': ['focus', '38'],
    'editorGroupHeader.tabsBackground': 'transparent',
    'editorGroupHeader.tabsBorder': 'line-separator',
    'editorGroupHeader.noTabsBackground': 'transparent',
    'tab.activeBackground': 'transparent',
    'tab.unfocusedActiveBackground': 'transparent',
    'tab.inactiveBackground': 'transparent',
    'tab.unfocusedInactiveBackground': 'transparent',
    'tab.activeForeground': 'ink',
    'tab.unfocusedActiveForeground': 'ink',
    'tab.inactiveForeground': 'ink-muted',
    'tab.unfocusedInactiveForeground': 'ink-muted',
    'tab.hoverBackground': 'surface-hover',
    'tab.unfocusedHoverBackground': 'surface-hover',
    'tab.border': 'line-separator',
    'tab.activeBorder': 'transparent',
    'tab.unfocusedActiveBorder': 'transparent',
    'tab.activeBorderTop': 'transparent',
    'tab.unfocusedActiveBorderTop': 'transparent',
    'tab.activeModifiedBorder': 'transparent',
    'breadcrumb.background': 'transparent',
    'breadcrumb.foreground': 'ink-muted',
    'breadcrumb.focusForeground': 'ink',
    'breadcrumb.activeSelectionForeground': 'ink',
    'breadcrumbPicker.background': 'popover',
    'editor.background': 'sheet-mid',
    'editor.foreground': 'ink',
    'editorGutter.background': 'transparent',
    'editor.lineHighlightBackground': ['ink', '0f'],
    'editor.lineHighlightBorder': 'transparent',
    'editorLineNumber.foreground': 'ink-faint',
    'editorLineNumber.activeForeground': 'ink',
    'editorCursor.foreground': 'ink',
    'editor.selectionBackground': ['focus', '38'],
    'editor.inactiveSelectionBackground': ['focus', '20'],
    'editor.selectionHighlightBackground': ['focus', '1f'],
    'editor.wordHighlightBackground': ['ink', '14'],
    'editor.wordHighlightStrongBackground': ['ink', '1f'],
    'editor.wordHighlightBorder': 'transparent',
    'editor.wordHighlightStrongBorder': 'transparent',
    'editor.findMatchBackground': ['attention', '66'],
    'editor.findMatchHighlightBackground': ['attention', '33'],
    'editor.linkedEditingBackground': ['focus', '1f'],
    'editor.foldBackground': ['ink', '0a'],
    'editorBracketMatch.background': ['focus', '1f'],
    'editorBracketMatch.border': ['focus', '66'],
    'editorWhitespace.foreground': 'line-separator',
    'editorIndentGuide.background': 'line-separator',
    'editorIndentGuide.background1': 'line-separator',
    'editorIndentGuide.activeBackground': 'line-control',
    'editorIndentGuide.activeBackground1': 'line-control',
    'editorRuler.foreground': 'line-separator',
    'editorLink.activeForeground': 'teal-ink',
    'editorInlayHint.background': ['ink', '0f'],
    'editorInlayHint.foreground': 'ink-faint',
    'editorInlayHint.typeBackground': ['ink', '0f'],
    'editorInlayHint.typeForeground': 'ink-faint',
    'editorInlayHint.paramBackground': ['ink', '0f'],
    'editorInlayHint.paramForeground': 'ink-faint',
    'editorError.foreground': 'error-ink',
    'editorWarning.foreground': 'attention',
    'editorInfo.foreground': 'teal-ink',
    'editorOverviewRuler.border': 'transparent',
    'editorStickyScroll.background': 'sheet-from',
    'editorStickyScrollHover.background': 'surface-hover',
    'editorStickyScroll.shadow': ['shadow', '29'],
    'editorWidget.background': 'popover',
    'editorWidget.foreground': 'ink',
    'editorWidget.border': 'line-separator',
    'editorHoverWidget.background': 'popover',
    'editorHoverWidget.foreground': 'ink',
    'editorHoverWidget.border': 'line-separator',
    'editorSuggestWidget.background': 'popover',
    'editorSuggestWidget.border': 'line-separator',
    'editorSuggestWidget.foreground': 'ink',
    'editorSuggestWidget.selectedBackground': 'surface-selected',
    'editorSuggestWidget.highlightForeground': 'redwood',
    'peekView.border': 'focus',
    'peekViewEditor.background': 'popover',
    'peekViewEditorGutter.background': 'popover',
    'peekViewResult.background': 'popover',
    'peekViewTitle.background': 'popover',
    'debugToolBar.background': 'popover',
    'minimap.background': 'sheet-mid',
    'scrollbar.shadow': 'transparent',
    'scrollbarSlider.background': ['ink', '40'],
    'scrollbarSlider.hoverBackground': ['ink', '59'],
    'scrollbarSlider.activeBackground': ['ink', '73'],
    'panel.background': 'transparent',
    'panel.border': 'line-separator',
    'panelTitle.activeForeground': 'ink',
    'panelTitle.inactiveForeground': 'ink-muted',
    'panelTitle.activeBorder': 'transparent',
    'panelInput.border': 'line-separator',
    'panelSectionHeader.background': 'transparent',
    'statusBar.background': 'transparent',
    'statusBar.foreground': 'ink-muted',
    'statusBar.border': 'line-separator',
    'statusBar.noFolderBackground': 'transparent',
    'statusBar.noFolderForeground': 'ink-muted',
    'statusBar.debuggingBackground': 'transparent',
    'statusBar.debuggingForeground': 'ink',
    'statusBar.focusBorder': 'focus',
    'statusBarItem.focusBorder': 'focus',
    'statusBarItem.hoverBackground': 'surface-hover',
    'statusBarItem.activeBackground': 'surface-selected',
    'statusBarItem.prominentBackground': 'surface-selected',
    'statusBarItem.remoteBackground': 'transparent',
    'statusBarItem.remoteForeground': 'ink',
    'statusBarItem.errorBackground': 'error-container',
    'statusBarItem.errorForeground': 'error-ink',
    'statusBarItem.warningBackground': 'ochre-container',
    'statusBarItem.warningForeground': 'ochre-ink',
    'quickInput.background': 'popover',
    'quickInput.foreground': 'ink',
    'quickInputList.focusBackground': 'surface-selected',
    'quickInputList.focusForeground': 'ink',
    'quickInputTitle.background': 'popover',
    'pickerGroup.border': 'line-separator',
    'pickerGroup.foreground': 'ink-muted',
    'input.background': 'popover',
    'input.foreground': 'ink',
    'input.border': 'line-separator',
    'input.placeholderForeground': 'ink-faint',
    'inputOption.activeBorder': 'focus',
    'inputOption.activeBackground': ['focus', '33'],
    'inputOption.activeForeground': 'ink',
    'inputValidation.errorBackground': 'error-container',
    'inputValidation.errorBorder': 'error-ink',
    'inputValidation.warningBackground': 'ochre-container',
    'inputValidation.warningBorder': 'attention',
    'inputValidation.infoBackground': 'teal-container',
    'inputValidation.infoBorder': 'teal-ink',
    'dropdown.background': 'popover',
    'dropdown.listBackground': 'popover',
    'dropdown.foreground': 'ink',
    'dropdown.border': 'line-separator',
    'checkbox.background': 'popover',
    'checkbox.border': 'line-control',
    'checkbox.foreground': 'ink',
    'button.background': 'redwood',
    'button.foreground': 'on-redwood',
    'button.hoverBackground': 'redwood-hover',
    'button.border': 'transparent',
    'button.separator': ['on-redwood', '66'],
    'button.secondaryBackground': 'surface-hover',
    'button.secondaryForeground': 'ink',
    'button.secondaryHoverBackground': 'surface-selected',
    'keybindingLabel.background': ['ink', '0f'],
    'keybindingLabel.foreground': 'ink-muted',
    'keybindingLabel.border': 'line-separator',
    'keybindingLabel.bottomBorder': 'line-separator',
    'notifications.background': 'popover',
    'notifications.foreground': 'ink',
    'notifications.border': 'line-separator',
    'notificationCenterHeader.background': 'popover',
    'notificationCenterHeader.foreground': 'ink',
    'notificationToast.border': 'line-separator',
    'notificationsErrorIcon.foreground': 'error-ink',
    'notificationsWarningIcon.foreground': 'attention',
    'notificationsInfoIcon.foreground': 'teal-ink',
    'terminal.background': 'term-bg',
    'terminal.foreground': 'term-ink',
    'terminal.border': 'line-separator',
    'terminalCursor.foreground': 'term-bright',
    'terminal.selectionBackground': ['focus', '38'],
    'textCodeBlock.background': ['ink', '0f'],
    'textPreformat.background': ['ink', '0f'],
    'textPreformat.foreground': 'ink',
    'textBlockQuote.background': 'transparent',
    'textBlockQuote.border': 'line-separator',
    'textSeparator.foreground': 'line-separator',
    'settings.headerForeground': 'ink',
    'settings.modifiedItemIndicator': 'focus',
};

const HEX = /^#[0-9a-f]{6}$/i;

/** Halfway between two `#rrggbb` colours, channel by channel. */
function mix(a: string, b: string): string {
    const channel = (at: number) => Math.round((parseInt(a.slice(at, at + 2), 16) + parseInt(b.slice(at, at + 2), 16)) / 2);
    return `#${[1, 3, 5].map(at => channel(at).toString(16).padStart(2, '0')).join('')}`;
}

/**
 * The frame's colour theme for the UI's look, as VS Code theme JSON over the code theme of the same
 * mode the UI highlights chat code with: Vitesse's for the Vitesse palette, GitHub's otherwise. A
 * colour whose token did not arrive as `#rrggbb` is left to that theme.
 */
export function ideThemeJson({ dark, palette, tokens }: IdeTheme): { name: string; type: 'light' | 'dark'; include: string; colors: Record<string, string> } {
    const value = (role: Role): string | undefined => {
        switch (role) {
            case 'transparent':
                return '#00000000';
            case 'shadow':
                return dark ? '#000000' : value('ink');
            case 'sheet-mid': {
                const [from, to] = [value('sheet-from'), value('sheet-to')];
                return from && to ? mix(from, to) : undefined;
            }
            default: {
                const colour = tokens[role];
                return colour && HEX.test(colour) ? colour.toLowerCase() : undefined;
            }
        }
    };
    const colors: Record<string, string> = {};
    for (const [id, source] of Object.entries(COLOURS)) {
        const [role, alpha] = typeof source === 'string' ? [source, ''] : source;
        const colour = value(role);
        if (colour) {
            colors[id] = role === 'transparent' ? colour : colour + alpha;
        }
    }
    return { name: 'Theorem UI', type: dark ? 'dark' : 'light', include: codeTheme(dark, palette), colors };
}

/** The code theme the UI highlights chat code with in a palette and mode (lib/palette's `code`; Vitesse's dark side is the soft one Theia ships). */
function codeTheme(dark: boolean, palette?: string): string {
    if (palette === 'vitesse') {
        return dark ? 'vitesse-dark-soft' : 'vitesse-light';
    }
    return dark ? 'github-dark-default' : 'github-light-default';
}
