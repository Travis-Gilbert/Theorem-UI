// SOURCING: none: the semantic palette over the theme's tokens (styles.css,
// palettes.css), so every color follows the active theme. Subjects take tones
// in the order the program first names them; nothing in a program picks one.

export type Tone = {
  /** Marks drawn in the subject's color: bars, lines, compute stages. */
  fill: string
  stroke: string
  solid: string
  /** The quieter form, for overhead such as setup and transfer. */
  tint: string
  border: string
  /** Text set in the subject's color: legend names, the winning value. */
  text: string
}

/** Blue then amber stay apart for the common color vision deficiencies; teal follows. */
const SUBJECT_TONES: readonly Tone[] = [
  {
    fill: 'fill-redwood',
    stroke: 'stroke-redwood',
    solid: 'bg-redwood',
    tint: 'bg-redwood-container',
    border: 'border-redwood',
    text: 'text-redwood-ink',
  },
  {
    fill: 'fill-ochre',
    stroke: 'stroke-ochre',
    solid: 'bg-ochre',
    tint: 'bg-ochre-container',
    border: 'border-ochre',
    text: 'text-ochre-ink',
  },
  {
    fill: 'fill-teal',
    stroke: 'stroke-teal',
    solid: 'bg-teal',
    tint: 'bg-teal-container',
    border: 'border-teal',
    text: 'text-teal-ink',
  },
]

/** For values that belong to no subject, and for subjects past the third. */
export const NEUTRAL: Tone = {
  fill: 'fill-ink-muted',
  stroke: 'stroke-ink-muted',
  solid: 'bg-ink-muted',
  tint: 'bg-raised',
  border: 'border-ink-faint',
  text: 'text-ink',
}

export function toneOf(subjects: readonly string[], subject?: string | null) {
  if (!subject) return NEUTRAL
  const index = subjects.indexOf(subject)
  return SUBJECT_TONES[index] ?? NEUTRAL
}
