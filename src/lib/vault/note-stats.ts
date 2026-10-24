// SOURCING: Intl.Segmenter (the platform's word and grapheme boundaries, so
// counts hold for languages without spaces and for emoji) over the note's body
// from the workspace's Markdown parser (parseNote drops the frontmatter).
import { parseNote } from '#/server/desktop/workspace/markdown'

const words = new Intl.Segmenter(undefined, { granularity: 'word' })
const graphemes = new Intl.Segmenter(undefined, { granularity: 'grapheme' })

/** A note's word and character counts, as Obsidian's status bar shows them. */
export function noteStats(text: string) {
  const { body } = parseNote(text)
  let wordCount = 0
  for (const segment of words.segment(body)) if (segment.isWordLike) wordCount++
  let characters = 0
  for (const segment of graphemes.segment(body.trim()))
    if (segment.segment !== '\n') characters++
  return { words: wordCount, characters }
}
