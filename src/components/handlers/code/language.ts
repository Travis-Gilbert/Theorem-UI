// SOURCING: @codemirror/language-data, CodeMirror's table of languages by
// file name, each loaded on demand. Kept apart from the editor so the
// registry can match code files without loading CodeMirror's views.
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { basename } from 'pathe'

/** The language CodeMirror knows for a file name, if any. */
export const languageFor = (path: string) =>
  LanguageDescription.matchFilename(languages, basename(path))
