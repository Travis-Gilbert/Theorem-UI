// SOURCING: what a screen reader skips and what a person reading aloud skips: marks that are for the eye (Markdown's emphasis, headings, rules, table bars), and things nobody reads out (code, an address). A handful of replacements over the text, not a Markdown parser: a reply is spoken as it reads, and being a little wrong about an edge only says a word oddly. The choices are this app's.

/** The most that is spoken of one message, in characters: a reply longer than this is cut at a sentence. */
export const SPOKEN_LIMIT = 4_000

/**
 * A reply as it would be read aloud: its words, without the marks that are
 * only for the eye. Code blocks are named and not read; a link is its words;
 * a list item is a sentence.
 */
export function speakable(markdown: string): string {
  let text = markdown
    // Fenced code is said to be there, and not read out.
    .replace(
      /(^|\n)(```|~~~)[^\n]*\n[\s\S]*?(\n\2[^\n]*|$)/g,
      '$1A block of code.\n',
    )
    // Hidden marks and markup.
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/?[a-zA-Z][^>\n]*>/g, ' ')
    // An image is its description; a link is its words.
    .replace(/!\[([^\]]*)\]\([^)\n]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)\n]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\[[^\]]*\]/g, '$1')
    // A bare address is said to be one; the full stop after it is the sentence's.
    .replace(/https?:\/\/[^\s)>\]]*[^\s)>\].,;:!?'"]/g, 'a link')
    // Inline code is its words.
    .replace(/`([^`\n]+)`/g, '$1')
    // A table's rule goes; its bars become pauses.
    .replace(/^[ \t]*\|?[ \t:|-]*-{3,}[ \t:|-]*$/gm, '')
    .replace(/[ \t]*\|[ \t]*/g, ', ')
    // Headings, quotes, rules, list marks.
    .replace(/^[ \t]{0,3}#{1,6}[ \t]+(.*?)[ \t#]*$/gm, '$1.')
    .replace(/^[ \t]*>[ \t]?/gm, '')
    .replace(/^[ \t]*([-*_])([ \t]*\1){2,}[ \t]*$/gm, '')
    .replace(
      /^[ \t]*(?:[-*+]|\d{1,3}[.)])[ \t]+(?:\[[ xX]\][ \t]+)?(.*)$/gm,
      '$1.',
    )
    // Emphasis.
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, '$2')
    .replace(/(^|[^\w*])\*(?=\S)([^*\n]*?\S)\*(?!\w)/g, '$1$2')
    .replace(/(^|[^\w_])_(?=\S)([^_\n]*?\S)_(?!\w)/g, '$1$2')
    .replace(/~~(?=\S)([\s\S]*?\S)~~/g, '$1')
    // What the replacements left doubled.
    .replace(/^[ \t]*,[ \t]*/gm, '')
    .replace(/,[ \t]*$/gm, '')
    .replace(/([.!?:;,])[ \t]*\.(?=\s|$)/g, '$1')
    .replace(/[ \t]+/g, ' ')
    .replace(/[ \t]*\n[ \t]*/g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim()
  if (text.length > SPOKEN_LIMIT) {
    const cut = text.slice(0, SPOKEN_LIMIT)
    const end = Math.max(
      cut.lastIndexOf('. '),
      cut.lastIndexOf('.\n'),
      cut.lastIndexOf('? '),
      cut.lastIndexOf('! '),
    )
    text = end > SPOKEN_LIMIT / 2 ? cut.slice(0, end + 1) : cut
  }
  return text
}
