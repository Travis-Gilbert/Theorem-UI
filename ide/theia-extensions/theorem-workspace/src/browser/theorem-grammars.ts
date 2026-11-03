// SOURCING: @theia/monaco LanguageGrammarDefinitionContribution and TextmateRegistry are the seam VS Code
// style languages use when no plugin host runs, tm-grammars supplies the TextMate grammars (Shiki's set,
// the same the UI's chat highlighting reads) and linguist-languages supplies file names and extensions.
// Comment tokens are hand-written: the plain-data sources for them ship inside a second copy of Monaco.
// *****************************************************************************
// Copyright (C) 2026 Theorem UI contributors.
//
// SPDX-License-Identifier: EPL-2.0 OR GPL-2.0-only WITH Classpath-exception-2.0
// *****************************************************************************

import { injectable } from '@theia/core/shared/inversify';
import { LanguageGrammarDefinitionContribution, TextmateRegistry } from '@theia/monaco/lib/browser/textmate';
import * as monaco from '@theia/monaco-editor-core';

const C_LIKE: monaco.languages.CommentRule = { lineComment: '//', blockComment: ['/*', '*/'] };
const HASH: monaco.languages.CommentRule = { lineComment: '#' };
const MARKUP: monaco.languages.CommentRule = { blockComment: ['<!--', '-->'] };

const PAIRS: monaco.languages.CharacterPair[] = [['{', '}'], ['[', ']'], ['(', ')']];
const QUOTES = ['"', "'", '`'].map(quote => ({ open: quote, close: quote, notIn: ['string', 'comment'] }));
const CLOSING = [...PAIRS.map(([open, close]) => ({ open, close })), ...QUOTES];

interface GrammarRow {
    /** The LSP language id, which the host also binds language servers by. */
    id: string;
    scope: string;
    /** esbuild resolves these statically; each grammar is parsed when its language first opens. */
    grammar: () => object;
    linguist: () => { default: { name: string; extensions?: string[]; filenames?: string[] } };
    comments?: monaco.languages.CommentRule;
    /** For a language Linguist folds into another, as it does JSX. */
    extensions?: string[];
}

/**
 * Later rows win a shared extension or file name: XML goes first because Linguist gives it `.ts` (Qt
 * translations), JSX follows JavaScript and tsconfig.json follows JSON.
 */
const LANGUAGES: GrammarRow[] = [
    { id: 'xml', scope: 'text.xml', grammar: () => require('tm-grammars/grammars/xml.json'), linguist: () => require('linguist-languages/data/XML'), comments: MARKUP },
    { id: 'typescript', scope: 'source.ts', grammar: () => require('tm-grammars/grammars/typescript.json'), linguist: () => require('linguist-languages/data/TypeScript'), comments: C_LIKE },
    { id: 'typescriptreact', scope: 'source.tsx', grammar: () => require('tm-grammars/grammars/tsx.json'), linguist: () => require('linguist-languages/data/TSX'), comments: C_LIKE },
    { id: 'javascript', scope: 'source.js', grammar: () => require('tm-grammars/grammars/javascript.json'), linguist: () => require('linguist-languages/data/JavaScript'), comments: C_LIKE },
    {
        id: 'javascriptreact', scope: 'source.js.jsx', grammar: () => require('tm-grammars/grammars/jsx.json'),
        linguist: () => require('linguist-languages/data/JavaScript'), comments: C_LIKE, extensions: ['.jsx']
    },
    { id: 'json', scope: 'source.json', grammar: () => require('tm-grammars/grammars/json.json'), linguist: () => require('linguist-languages/data/JSON') },
    { id: 'jsonc', scope: 'source.json.comments', grammar: () => require('tm-grammars/grammars/jsonc.json'), linguist: () => require('linguist-languages/data/JSON_20_with_20_Comments'), comments: C_LIKE },
    { id: 'rust', scope: 'source.rust', grammar: () => require('tm-grammars/grammars/rust.json'), linguist: () => require('linguist-languages/data/Rust'), comments: C_LIKE },
    { id: 'python', scope: 'source.python', grammar: () => require('tm-grammars/grammars/python.json'), linguist: () => require('linguist-languages/data/Python'), comments: HASH },
    { id: 'go', scope: 'source.go', grammar: () => require('tm-grammars/grammars/go.json'), linguist: () => require('linguist-languages/data/Go'), comments: C_LIKE },
    { id: 'css', scope: 'source.css', grammar: () => require('tm-grammars/grammars/css.json'), linguist: () => require('linguist-languages/data/CSS'), comments: { blockComment: ['/*', '*/'] } },
    { id: 'scss', scope: 'source.css.scss', grammar: () => require('tm-grammars/grammars/scss.json'), linguist: () => require('linguist-languages/data/SCSS'), comments: C_LIKE },
    { id: 'less', scope: 'source.css.less', grammar: () => require('tm-grammars/grammars/less.json'), linguist: () => require('linguist-languages/data/Less'), comments: C_LIKE },
    { id: 'html', scope: 'text.html.basic', grammar: () => require('tm-grammars/grammars/html.json'), linguist: () => require('linguist-languages/data/HTML'), comments: MARKUP },
    { id: 'markdown', scope: 'text.html.markdown', grammar: () => require('tm-grammars/grammars/markdown.json'), linguist: () => require('linguist-languages/data/Markdown'), comments: MARKUP },
    { id: 'yaml', scope: 'source.yaml', grammar: () => require('tm-grammars/grammars/yaml.json'), linguist: () => require('linguist-languages/data/YAML'), comments: HASH },
    { id: 'toml', scope: 'source.toml', grammar: () => require('tm-grammars/grammars/toml.json'), linguist: () => require('linguist-languages/data/TOML'), comments: HASH },
    { id: 'shellscript', scope: 'source.shell', grammar: () => require('tm-grammars/grammars/shellscript.json'), linguist: () => require('linguist-languages/data/Shell'), comments: HASH },
    { id: 'sql', scope: 'source.sql', grammar: () => require('tm-grammars/grammars/sql.json'), linguist: () => require('linguist-languages/data/SQL'), comments: { lineComment: '--', blockComment: ['/*', '*/'] } },
    { id: 'c', scope: 'source.c', grammar: () => require('tm-grammars/grammars/c.json'), linguist: () => require('linguist-languages/data/C'), comments: C_LIKE },
    { id: 'cpp', scope: 'source.cpp', grammar: () => require('tm-grammars/grammars/cpp.json'), linguist: () => require('linguist-languages/data/C_2b__2b_'), comments: C_LIKE },
    { id: 'java', scope: 'source.java', grammar: () => require('tm-grammars/grammars/java.json'), linguist: () => require('linguist-languages/data/Java'), comments: C_LIKE },
    { id: 'dockerfile', scope: 'source.dockerfile', grammar: () => require('tm-grammars/grammars/docker.json'), linguist: () => require('linguist-languages/data/Dockerfile'), comments: HASH },
    { id: 'ruby', scope: 'source.ruby', grammar: () => require('tm-grammars/grammars/ruby.json'), linguist: () => require('linguist-languages/data/Ruby'), comments: HASH },
    { id: 'swift', scope: 'source.swift', grammar: () => require('tm-grammars/grammars/swift.json'), linguist: () => require('linguist-languages/data/Swift'), comments: C_LIKE },
    { id: 'kotlin', scope: 'source.kotlin', grammar: () => require('tm-grammars/grammars/kotlin.json'), linguist: () => require('linguist-languages/data/Kotlin'), comments: C_LIKE },
    { id: 'php', scope: 'source.php', grammar: () => require('tm-grammars/grammars/php.json'), linguist: () => require('linguist-languages/data/PHP'), comments: C_LIKE },
    { id: 'csharp', scope: 'source.cs', grammar: () => require('tm-grammars/grammars/csharp.json'), linguist: () => require('linguist-languages/data/C_23_'), comments: C_LIKE },
    { id: 'graphql', scope: 'source.graphql', grammar: () => require('tm-grammars/grammars/graphql.json'), linguist: () => require('linguist-languages/data/GraphQL'), comments: HASH },
    { id: 'lua', scope: 'source.lua', grammar: () => require('tm-grammars/grammars/lua.json'), linguist: () => require('linguist-languages/data/Lua'), comments: { lineComment: '--', blockComment: ['--[[', ']]'] } },
];

/** Highlighting, comment toggling and bracket behaviour for the languages above. */
@injectable()
export class TheoremGrammars implements LanguageGrammarDefinitionContribution {

    registerTextmateLanguage(registry: TextmateRegistry): void {
        for (const row of LANGUAGES) {
            const { name, extensions, filenames } = row.linguist().default;
            monaco.languages.register({ id: row.id, aliases: [name], extensions: row.extensions ?? extensions, filenames: row.extensions ? undefined : filenames });
            monaco.languages.setLanguageConfiguration(row.id, { comments: row.comments, brackets: PAIRS, autoClosingPairs: CLOSING, surroundingPairs: CLOSING });
            registry.registerTextmateGrammarScope(row.scope, { getGrammarDefinition: async () => ({ format: 'json', content: row.grammar() }) });
            registry.mapLanguageIdToTextmateGrammar(row.id, row.scope);
        }
    }
}
