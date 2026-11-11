// SOURCING: none: a TypeScript program as Theorem publishes one to its
// conversation, in the `program` part's own fields (language, source).
// Plain data, so the story list can read it without components.

/** A program that reads the conversation's App, changes it and saves it. */
export const PROGRAM_PART = {
  language: 'typescript',
  source: `const app = await tool("read_app", { documentId: "doc_shopping" })
const html = app.html.replace(
  "<li>Milk</li>",
  "<li>Milk</li><li>Eggs</li>",
)
const saved = await tool("write_app", {
  documentId: app.documentId,
  revision: app.revision,
  title: app.title,
  html,
})
if (!saved.check?.built) console.log(saved.check?.problems)
saved.revision
`,
} as const
