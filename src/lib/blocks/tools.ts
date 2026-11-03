// SOURCING: hand-rolled, two lines over format.ts's CODE_LANGUAGES: which
// files the code editor's Run runs as tools. Kept apart from the tool views so
// the code handler can ask without loading them.
import { CODE_LANGUAGES } from './format'

const extensionOf = (path: string) => {
  const name = path.slice(path.lastIndexOf('/') + 1)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

/** Whether the code handler's Run runs this file: TypeScript or JavaScript. */
export const runsAsTool = (path: string) =>
  CODE_LANGUAGES.has(extensionOf(path))
