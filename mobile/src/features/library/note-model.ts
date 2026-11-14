// SOURCING: none. The Files API's naming rules (docs/plans/SPEC-THEOREM-FILES-API-1.0.md, "Placement"): a `.md` path with no entry becomes a user-authored document, and an unplaced user note's default home is `Notes/<title>.md`.
//
// What typing a name in Search and choosing "Create note" asks Theorem to store.

const FOLDER = 'Notes'

/** The spec's title cleanup: `/`, `\`, `:` and control characters become `-`, then trim; nothing left is `Untitled`. */
export function noteTitle(query: string): string {
  // eslint-disable-next-line no-control-regex
  const clean = query.replace(/[/\\:\u0000-\u001f\u007f]/g, '-').trim()
  return clean || 'Untitled'
}

export const notePath = (title: string) => `${FOLDER}/${title}.md`

/** The note starts as its title; Theorem reads the first heading as the document title. */
export const noteBody = (title: string) => `# ${title}\n`
