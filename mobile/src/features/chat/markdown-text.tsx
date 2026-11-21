// Existing MarkdownText consumers share the rich native renderer, so links,
// streamed code, tables and task lists behave consistently across reply surfaces.
// Typed App revisions and client operations remain message parts, outside Markdown.
export { RichText as MarkdownText } from './rich-text'
