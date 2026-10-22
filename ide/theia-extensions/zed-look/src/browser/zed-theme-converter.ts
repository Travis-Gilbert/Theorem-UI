// SOURCING: hand-roll — no library converts Zed themes to VS Code themes (Zed's crates/theme_importer only goes VS Code -> Zed); the tables below invert its mapping.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

/**
 * Converts Zed theme families (`assets/themes/<family>/<family>.json` in the Zed repository) into
 * VS Code color themes, the format Theia's `MonacoThemingService` accepts.
 *
 * The workbench colors invert the table in Zed's `crates/theme_importer/src/vscode/converter.rs`,
 * extended to the VS Code colors that importer ignores. The syntax scopes follow
 * `crates/theme_importer/src/vscode/syntax.rs`, with each TextMate scope assigned to exactly one
 * Zed token, plus the bare semantic token type names Monaco matches LSP semantic tokens against.
 */

export interface ZedHighlightStyle {
    color?: string | null;
    background_color?: string | null;
    font_style?: 'normal' | 'italic' | 'oblique' | null;
    font_weight?: number | null;
}

export interface ZedPlayerColor {
    cursor?: string | null;
    background?: string | null;
    selection?: string | null;
}

export interface ZedTheme {
    name: string;
    appearance: 'dark' | 'light';
    style: {
        players?: ZedPlayerColor[];
        syntax?: Record<string, ZedHighlightStyle>;
        [key: string]: unknown;
    };
}

export interface ZedThemeFamily {
    name: string;
    author: string;
    themes: ZedTheme[];
}

export interface VSCodeThemeRegistration {
    id: string;
    label: string;
    uiTheme: 'vs' | 'vs-dark';
    json: {
        name: string;
        type: 'dark' | 'light';
        colors: Record<string, string>;
        tokenColors: { name: string; scope: string[]; settings: { foreground?: string; background?: string; fontStyle?: string } }[];
    };
}

/** VS Code color id -> Zed style keys, first non-null wins. */
const WORKBENCH_COLORS: Record<string, string[]> = {
    'foreground': ['text'],
    'descriptionForeground': ['text.muted'],
    'disabledForeground': ['text.disabled'],
    'errorForeground': ['error'],
    'icon.foreground': ['icon'],
    'focusBorder': ['border.focused'],
    'contrastBorder': ['border.transparent'],
    'widget.border': ['border'],
    'sash.hoverBorder': ['border.focused'],
    'textLink.foreground': ['text.accent'],
    'textLink.activeForeground': ['link_text.hover'],
    'progressBar.background': ['text.accent'],
    'toolbar.hoverBackground': ['ghost_element.hover'],
    'toolbar.activeBackground': ['ghost_element.active'],

    'titleBar.activeBackground': ['title_bar.background'],
    'titleBar.inactiveBackground': ['title_bar.inactive_background'],
    'titleBar.activeForeground': ['text'],
    'titleBar.inactiveForeground': ['text.muted'],
    'titleBar.border': ['border'],
    'menubar.selectionBackground': ['ghost_element.hover'],
    'menubar.selectionForeground': ['text'],
    'menu.background': ['elevated_surface.background'],
    'menu.foreground': ['text'],
    'menu.selectionBackground': ['ghost_element.selected'],
    'menu.selectionForeground': ['text'],
    'menu.border': ['border'],
    'menu.separatorBackground': ['border.variant'],

    'activityBar.background': ['panel.background'],
    'activityBar.foreground': ['icon'],
    'activityBar.inactiveForeground': ['icon.muted'],
    'activityBar.border': ['border'],
    'activityBar.activeBorder': ['border.transparent'],
    'activityBar.activeBackground': ['ghost_element.selected'],
    'activityBarBadge.background': ['text.accent'],
    'activityBarBadge.foreground': ['editor.background'],
    'badge.background': ['element.active'],
    'badge.foreground': ['text'],

    'sideBar.background': ['panel.background'],
    'sideBar.foreground': ['text'],
    'sideBar.border': ['border'],
    'sideBarTitle.foreground': ['text.muted'],
    'sideBarSectionHeader.background': ['panel.background'],
    'sideBarSectionHeader.foreground': ['text'],
    'sideBarSectionHeader.border': ['border.variant'],

    'list.hoverBackground': ['ghost_element.hover'],
    'list.hoverForeground': ['text'],
    'list.activeSelectionBackground': ['ghost_element.selected'],
    'list.activeSelectionForeground': ['text'],
    'list.inactiveSelectionBackground': ['ghost_element.selected'],
    'list.inactiveSelectionForeground': ['text'],
    'list.focusBackground': ['ghost_element.selected'],
    'list.focusOutline': ['border.focused'],
    'list.inactiveFocusOutline': ['border.transparent'],
    'list.dropBackground': ['drop_target.background'],
    'list.highlightForeground': ['text.accent'],
    'list.focusHighlightForeground': ['text.accent'],
    'list.errorForeground': ['error'],
    'list.warningForeground': ['warning'],
    'tree.indentGuidesStroke': ['border.variant'],

    'editorGroup.border': ['border'],
    'editorGroup.dropBackground': ['drop_target.background'],
    'editorGroupHeader.tabsBackground': ['tab_bar.background'],
    'editorGroupHeader.tabsBorder': ['border'],
    'editorGroupHeader.noTabsBackground': ['tab_bar.background'],
    'tab.activeBackground': ['tab.active_background'],
    'tab.unfocusedActiveBackground': ['tab.active_background'],
    'tab.inactiveBackground': ['tab.inactive_background'],
    'tab.unfocusedInactiveBackground': ['tab.inactive_background'],
    'tab.activeForeground': ['text'],
    'tab.unfocusedActiveForeground': ['text'],
    'tab.inactiveForeground': ['text.muted'],
    'tab.unfocusedInactiveForeground': ['text.muted'],
    'tab.hoverBackground': ['ghost_element.hover'],
    'tab.unfocusedHoverBackground': ['ghost_element.hover'],
    'tab.border': ['border'],
    'tab.activeBorder': ['tab.active_background'],
    'tab.unfocusedActiveBorder': ['tab.active_background'],
    'tab.activeBorderTop': ['border.transparent'],
    'tab.unfocusedActiveBorderTop': ['border.transparent'],
    'tab.activeModifiedBorder': ['border.transparent'],
    'breadcrumb.background': ['toolbar.background'],
    'breadcrumb.foreground': ['text.muted'],
    'breadcrumb.focusForeground': ['text'],
    'breadcrumb.activeSelectionForeground': ['text'],
    'breadcrumbPicker.background': ['elevated_surface.background'],

    'editor.background': ['editor.background'],
    'editor.foreground': ['editor.foreground'],
    'editorGutter.background': ['editor.gutter.background'],
    'editor.lineHighlightBackground': ['editor.active_line.background'],
    'editor.lineHighlightBorder': ['border.transparent'],
    'editorLineNumber.foreground': ['editor.line_number'],
    'editorLineNumber.activeForeground': ['editor.active_line_number'],
    'editor.findMatchBackground': ['search.active_match_background'],
    'editor.findMatchHighlightBackground': ['search.match_background'],
    'editor.wordHighlightBackground': ['editor.document_highlight.read_background'],
    'editor.wordHighlightStrongBackground': ['editor.document_highlight.write_background'],
    'editorBracketMatch.background': ['editor.document_highlight.bracket_background', 'editor.document_highlight.read_background'],
    'editorBracketMatch.border': ['border.transparent'],
    'editorWhitespace.foreground': ['editor.invisible'],
    'editorIndentGuide.background1': ['editor.wrap_guide'],
    'editorIndentGuide.activeBackground1': ['editor.active_wrap_guide'],
    'editorRuler.foreground': ['editor.wrap_guide'],
    'editorLink.activeForeground': ['link_text.hover'],
    'editorInlayHint.foreground': ['hint'],
    'editorInlayHint.background': ['hint.background'],
    'editorGhostText.foreground': ['predictive'],
    'editorError.foreground': ['error'],
    'editorWarning.foreground': ['warning'],
    'editorInfo.foreground': ['info'],
    'editorHint.foreground': ['hint'],
    'editorUnnecessaryCode.border': ['border.transparent'],
    'editorGutter.addedBackground': ['version_control.added', 'created'],
    'editorGutter.modifiedBackground': ['version_control.modified', 'modified'],
    'editorGutter.deletedBackground': ['version_control.deleted', 'deleted'],
    'editorOverviewRuler.border': ['scrollbar.track.border'],
    'editorOverviewRuler.addedForeground': ['version_control.added', 'created'],
    'editorOverviewRuler.modifiedForeground': ['version_control.modified', 'modified'],
    'editorOverviewRuler.deletedForeground': ['version_control.deleted', 'deleted'],
    'editorOverviewRuler.errorForeground': ['error'],
    'editorOverviewRuler.warningForeground': ['warning'],
    'editorOverviewRuler.infoForeground': ['info'],
    'editorStickyScroll.background': ['editor.background'],
    'editorStickyScrollHover.background': ['editor.highlighted_line.background'],
    'diffEditor.insertedTextBackground': ['version_control.word_added', 'created.background'],
    'diffEditor.removedTextBackground': ['version_control.word_deleted', 'deleted.background'],
    'diffEditor.insertedLineBackground': ['created.background'],
    'diffEditor.removedLineBackground': ['deleted.background'],
    'merge.currentHeaderBackground': ['version_control.conflict_marker.ours', 'created.background'],
    'merge.incomingHeaderBackground': ['version_control.conflict_marker.theirs', 'info.background'],

    'editorWidget.background': ['elevated_surface.background'],
    'editorWidget.foreground': ['text'],
    'editorWidget.border': ['border'],
    'editorHoverWidget.background': ['elevated_surface.background'],
    'editorHoverWidget.border': ['border'],
    'editorSuggestWidget.background': ['elevated_surface.background'],
    'editorSuggestWidget.border': ['border'],
    'editorSuggestWidget.foreground': ['text'],
    'editorSuggestWidget.selectedBackground': ['ghost_element.selected'],
    'editorSuggestWidget.highlightForeground': ['text.accent'],
    'peekView.border': ['border.focused'],
    'peekViewEditor.background': ['editor.background'],
    'peekViewResult.background': ['panel.background'],
    'peekViewTitle.background': ['editor.subheader.background'],
    'debugToolBar.background': ['elevated_surface.background'],

    'scrollbar.shadow': ['border.transparent'],
    'scrollbarSlider.background': ['scrollbar.thumb.background'],
    'scrollbarSlider.hoverBackground': ['scrollbar.thumb.hover_background'],
    'scrollbarSlider.activeBackground': ['scrollbar.thumb.active_background', 'scrollbar.thumb.hover_background'],
    'minimap.background': ['editor.background'],
    'minimapSlider.background': ['scrollbar.thumb.background'],
    'minimapSlider.hoverBackground': ['scrollbar.thumb.hover_background'],
    'minimapSlider.activeBackground': ['scrollbar.thumb.active_background', 'scrollbar.thumb.hover_background'],

    'panel.background': ['panel.background'],
    'panel.border': ['border'],
    'panelTitle.activeForeground': ['text'],
    'panelTitle.inactiveForeground': ['text.muted'],
    'panelTitle.activeBorder': ['border.transparent'],
    'panelSectionHeader.background': ['panel.background'],

    'statusBar.background': ['status_bar.background'],
    'statusBar.foreground': ['text.muted'],
    'statusBar.border': ['border'],
    'statusBar.noFolderBackground': ['status_bar.background'],
    'statusBar.noFolderForeground': ['text.muted'],
    'statusBar.debuggingBackground': ['status_bar.background'],
    'statusBar.debuggingForeground': ['text'],
    'statusBar.offlineBackground': ['status_bar.background'],
    'statusBar.offlineForeground': ['warning'],
    'statusBarItem.hoverBackground': ['ghost_element.hover'],
    'statusBarItem.activeBackground': ['ghost_element.active'],
    'statusBarItem.remoteBackground': ['status_bar.background'],
    'statusBarItem.remoteForeground': ['text'],
    'statusBarItem.errorBackground': ['error.background'],
    'statusBarItem.errorForeground': ['error'],
    'statusBarItem.warningBackground': ['warning.background'],
    'statusBarItem.warningForeground': ['warning'],

    'quickInput.background': ['elevated_surface.background'],
    'quickInput.foreground': ['text'],
    'quickInputList.focusBackground': ['ghost_element.selected'],
    'quickInputList.focusForeground': ['text'],
    'quickInputTitle.background': ['elevated_surface.background'],
    'pickerGroup.border': ['border.variant'],
    'pickerGroup.foreground': ['text.muted'],
    'input.background': ['editor.background'],
    'input.foreground': ['text'],
    'input.border': ['border'],
    'input.placeholderForeground': ['text.placeholder'],
    'inputOption.activeBorder': ['border.focused'],
    'inputOption.activeBackground': ['element.selected'],
    'inputOption.activeForeground': ['text'],
    'inputValidation.errorBackground': ['error.background'],
    'inputValidation.errorBorder': ['error.border'],
    'inputValidation.warningBackground': ['warning.background'],
    'inputValidation.warningBorder': ['warning.border'],
    'inputValidation.infoBackground': ['info.background'],
    'inputValidation.infoBorder': ['info.border'],
    'dropdown.background': ['elevated_surface.background'],
    'dropdown.listBackground': ['elevated_surface.background'],
    'dropdown.foreground': ['text'],
    'dropdown.border': ['border'],
    'checkbox.background': ['element.background'],
    'checkbox.border': ['border'],
    'checkbox.foreground': ['text'],
    'button.background': ['element.background'],
    'button.foreground': ['text'],
    'button.hoverBackground': ['element.hover'],
    'button.border': ['border'],
    'button.separator': ['border.variant'],
    'button.secondaryBackground': ['ghost_element.background'],
    'button.secondaryForeground': ['text'],
    'button.secondaryHoverBackground': ['ghost_element.hover'],
    'keybindingLabel.background': ['element.background'],
    'keybindingLabel.foreground': ['text.muted'],
    'keybindingLabel.border': ['border.variant'],
    'keybindingLabel.bottomBorder': ['border.variant'],

    'notifications.background': ['elevated_surface.background'],
    'notifications.foreground': ['text'],
    'notifications.border': ['border'],
    'notificationCenterHeader.background': ['elevated_surface.background'],
    'notificationToast.border': ['border'],
    'notificationsErrorIcon.foreground': ['error'],
    'notificationsWarningIcon.foreground': ['warning'],
    'notificationsInfoIcon.foreground': ['info'],

    'gitDecoration.addedResourceForeground': ['created'],
    'gitDecoration.untrackedResourceForeground': ['created'],
    'gitDecoration.modifiedResourceForeground': ['modified'],
    'gitDecoration.deletedResourceForeground': ['deleted'],
    'gitDecoration.renamedResourceForeground': ['renamed'],
    'gitDecoration.conflictingResourceForeground': ['conflict'],
    'gitDecoration.ignoredResourceForeground': ['ignored'],

    'terminal.background': ['terminal.background'],
    'terminal.foreground': ['terminal.foreground'],
    'terminal.border': ['border'],
    'terminal.ansiBlack': ['terminal.ansi.black'],
    'terminal.ansiRed': ['terminal.ansi.red'],
    'terminal.ansiGreen': ['terminal.ansi.green'],
    'terminal.ansiYellow': ['terminal.ansi.yellow'],
    'terminal.ansiBlue': ['terminal.ansi.blue'],
    'terminal.ansiMagenta': ['terminal.ansi.magenta'],
    'terminal.ansiCyan': ['terminal.ansi.cyan'],
    'terminal.ansiWhite': ['terminal.ansi.white'],
    'terminal.ansiBrightBlack': ['terminal.ansi.bright_black'],
    'terminal.ansiBrightRed': ['terminal.ansi.bright_red'],
    'terminal.ansiBrightGreen': ['terminal.ansi.bright_green'],
    'terminal.ansiBrightYellow': ['terminal.ansi.bright_yellow'],
    'terminal.ansiBrightBlue': ['terminal.ansi.bright_blue'],
    'terminal.ansiBrightMagenta': ['terminal.ansi.bright_magenta'],
    'terminal.ansiBrightCyan': ['terminal.ansi.bright_cyan'],
    'terminal.ansiBrightWhite': ['terminal.ansi.bright_white']
};

/** VS Code color id -> field of the local player (Zed's `players[0]`). */
const PLAYER_COLORS: Record<string, keyof ZedPlayerColor> = {
    'editorCursor.foreground': 'cursor',
    'terminalCursor.foreground': 'cursor',
    'selection.background': 'selection',
    'editor.selectionBackground': 'selection',
    'editor.inactiveSelectionBackground': 'selection',
    'terminal.selectionBackground': 'selection'
};

/**
 * Zed syntax token -> TextMate scopes. A scope appears once; the bare names (`function`, `type`, ...)
 * are the LSP semantic token types Monaco matches theme rules against.
 */
const SYNTAX_SCOPES: Record<string, string[]> = {
    'comment': ['comment', 'punctuation.definition.comment'],
    'comment.doc': ['comment.block.documentation', 'comment.line.documentation', 'comment.block.javadoc'],
    'keyword': ['keyword', 'keyword.control', 'keyword.other', 'storage', 'storage.type', 'storage.modifier'],
    'operator': ['keyword.operator', 'operator'],
    'string': ['string', 'string.quoted', 'string.template'],
    'string.escape': ['constant.character.escape', 'string.escape'],
    'string.regex': ['string.regexp', 'regexp'],
    'string.special': ['string.special', 'constant.other.placeholder'],
    'string.special.symbol': ['constant.other.symbol', 'string.special.symbol'],
    'number': ['constant.numeric', 'number'],
    'boolean': ['constant.language.boolean'],
    'constant': ['constant', 'constant.language', 'constant.character', 'variable.other.constant', 'support.constant'],
    'function': ['entity.name.function', 'support.function', 'variable.function', 'function', 'method', 'macro'],
    'constructor': ['entity.name.function.constructor', 'new.expr entity.name.type'],
    'type': [
        'entity.name.type', 'entity.name.class', 'entity.other.inherited-class', 'support.type', 'support.class',
        'storage.type.primitive', 'keyword.type', 'type', 'class', 'interface', 'struct', 'typeParameter'
    ],
    'enum': ['entity.name.type.enum', 'support.type.enum', 'enum'],
    'variant': ['variable.other.enummember', 'entity.name.variant', 'enumMember'],
    'property': [
        'variable.other.property', 'variable.other.object.property', 'variable.other.field', 'variable.member',
        'support.type.property-name', 'meta.object-literal.key', 'property'
    ],
    'variable': ['variable', 'variable.other', 'variable.other.readwrite'],
    'variable.parameter': ['variable.parameter', 'parameter'],
    'variable.special': ['variable.language', 'variable.special'],
    'attribute': ['entity.other.attribute-name', 'meta.decorator', 'decorator'],
    'tag': ['entity.name.tag', 'meta.tag.sgml'],
    'namespace': ['entity.name.namespace', 'entity.name.module', 'entity.name.type.module', 'namespace'],
    'label': ['entity.name.label', 'punctuation.definition.label', 'label'],
    'preproc': ['meta.preprocessor', 'keyword.control.directive', 'punctuation.definition.preprocessor'],
    'punctuation': ['punctuation'],
    'punctuation.bracket': ['punctuation.bracket', 'meta.brace', 'punctuation.definition.block', 'punctuation.definition.parameters', 'punctuation.definition.tag'],
    'punctuation.delimiter': ['punctuation.separator', 'punctuation.terminator', 'punctuation.accessor', 'punctuation.delimiter'],
    'punctuation.special': ['punctuation.special', 'punctuation.definition.template-expression', 'punctuation.section.embedded'],
    'punctuation.list_marker': ['punctuation.definition.list.begin', 'markup.list punctuation.definition.list.begin'],
    'punctuation.markup': [
        'punctuation.definition.heading', 'punctuation.definition.bold', 'punctuation.definition.italic',
        'punctuation.definition.raw', 'punctuation.definition.quote'
    ],
    'selector': ['entity.other.attribute-name.class.css', 'entity.other.attribute-name.id.css', 'entity.name.tag.css'],
    'selector.pseudo': ['entity.other.attribute-name.pseudo-class.css', 'entity.other.attribute-name.pseudo-element.css'],
    'embedded': ['meta.embedded'],
    'title': ['markup.heading', 'entity.name.section'],
    'emphasis': ['markup.italic'],
    'emphasis.strong': ['markup.bold'],
    'link_text': ['string.other.link'],
    'link_uri': ['markup.underline.link'],
    'text.literal': ['markup.inline.raw', 'markup.raw', 'markup.fenced_code'],
    'diff.plus': ['markup.inserted'],
    'diff.minus': ['markup.deleted']
};

export function zedThemeId(theme: ZedTheme): string {
    return 'zed-' + theme.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
}

export function convertZedTheme(theme: ZedTheme): VSCodeThemeRegistration {
    const style = theme.style;
    const colors: Record<string, string> = {};
    for (const [vscodeKey, zedKeys] of Object.entries(WORKBENCH_COLORS)) {
        const value = zedKeys.map(key => style[key]).find(isColor);
        if (value) {
            colors[vscodeKey] = value;
        }
    }
    const player = style.players?.[0];
    for (const [vscodeKey, field] of Object.entries(PLAYER_COLORS)) {
        const value = player?.[field];
        if (isColor(value)) {
            colors[vscodeKey] = value;
        }
    }
    const tokenColors: VSCodeThemeRegistration['json']['tokenColors'] = [];
    for (const [zedToken, scope] of Object.entries(SYNTAX_SCOPES)) {
        const highlight = style.syntax?.[zedToken];
        if (!highlight) {
            continue;
        }
        const fontStyle = [
            highlight.font_style === 'italic' || highlight.font_style === 'oblique' ? 'italic' : '',
            (highlight.font_weight ?? 0) >= 600 ? 'bold' : ''
        ].filter(Boolean).join(' ');
        const settings = {
            ...(isColor(highlight.color) ? { foreground: highlight.color } : {}),
            ...(isColor(highlight.background_color) ? { background: highlight.background_color } : {}),
            ...(fontStyle ? { fontStyle } : {})
        };
        if (Object.keys(settings).length) {
            tokenColors.push({ name: zedToken, scope, settings });
        }
    }
    return {
        id: zedThemeId(theme),
        label: `${theme.name} (Zed)`,
        uiTheme: theme.appearance === 'light' ? 'vs' : 'vs-dark',
        json: { name: theme.name, type: theme.appearance, colors, tokenColors }
    };
}

function isColor(value: unknown): value is string {
    return typeof value === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(value);
}
