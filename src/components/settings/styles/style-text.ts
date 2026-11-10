// SOURCING: none — pure functions over the response-styles types; the one reviewable text that both sides of every difference on the page are built from
import type {
  FrameworkDraft,
  ResponseFrameworkDetail,
  ResponseStyleDetail,
  StyleDraft,
} from '@/lib/theorem/response-styles'

type Prose = { name: string; description: string; body: string }

const head = ({ name, description }: Prose) =>
  `Name: ${name}\nDescription: ${description}\n`

/** Name, description and instructions: what a drafted change can touch. */
export const proseText = (prose: Prose) =>
  `${head(prose)}\n${prose.body.trimEnd()}\n`

/** A style as the person reads it: its frameworks by name, then its instructions. */
export function styleText(
  draft: StyleDraft,
  frameworkName: (id: string) => string,
) {
  const frameworks = draft.frameworks.length
    ? draft.frameworks.map(frameworkName).join(', ')
    : 'none'
  return `${head(draft)}Frameworks: ${frameworks}\n\n${draft.body.trimEnd()}\n`
}

/** A framework as the person reads it: its instructions, then each reference under its path. */
export function frameworkText(draft: FrameworkDraft) {
  const references = draft.references
    .map(({ path, body }) => `\n--- ${path} ---\n${body.trimEnd()}\n`)
    .join('')
  return `${proseText(draft)}${references}`
}

export const toStyleDraft = (detail: ResponseStyleDetail): StyleDraft => ({
  name: detail.name,
  description: detail.description,
  body: detail.body,
  frameworks: [...detail.frameworks],
})

export const toFrameworkDraft = (
  detail: ResponseFrameworkDetail,
): FrameworkDraft => ({
  name: detail.name,
  description: detail.description,
  body: detail.body,
  references: detail.references.map(({ path, body }) => ({ path, body })),
})

const sameSet = (a: readonly string[], b: readonly string[]) =>
  a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n')

export const sameStyleDraft = (a: StyleDraft, b: StyleDraft) =>
  a.name === b.name &&
  a.description === b.description &&
  a.body === b.body &&
  sameSet(a.frameworks, b.frameworks)

export const sameFrameworkDraft = (a: FrameworkDraft, b: FrameworkDraft) =>
  a.name === b.name &&
  a.description === b.description &&
  a.body === b.body &&
  a.references.length === b.references.length &&
  a.references.every((reference, index) => {
    const other = b.references.at(index)
    return reference.path === other?.path && reference.body === other.body
  })

/** "5 Jan 2026, 14:03", in the reader's locale. */
export const when = (ms: number) =>
  new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
