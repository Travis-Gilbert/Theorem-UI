// SOURCING: none upstream; the sections' names and the rule for renaming them are this panel's own
//
// The Notes panel lists its rows under three sections, each headed by a name
// the person can change: their folders, their loose notes, and what agents
// wrote. Only a name that differs from the section's own is kept.

export type NoteSection = 'folders' | 'notes' | 'agents'

export type SectionNames = Readonly<Partial<Record<NoteSection, string>>>

const OWN_NAME: Record<NoteSection, string> = {
  folders: 'Folders',
  notes: 'Notes',
  agents: 'Agents',
}

/** The sections, in the panel's order. */
export const NOTE_SECTIONS: readonly NoteSection[] = [
  'folders',
  'notes',
  'agents',
]

export const sectionName = (section: NoteSection, names: SectionNames) =>
  names[section] ?? OWN_NAME[section]

/** The names with one section renamed; an empty name, or its own, clears it. */
export function renameSection(
  names: SectionNames,
  section: NoteSection,
  wanted: string,
): SectionNames {
  const { [section]: _previous, ...others } = names
  const name = wanted.trim()
  return name && name !== OWN_NAME[section]
    ? { ...others, [section]: name }
    : others
}
