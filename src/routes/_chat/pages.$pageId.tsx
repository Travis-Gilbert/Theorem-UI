import { createFileRoute } from '@tanstack/react-router'

// One page, by its vault entry id (a rename keeps it); the _chat layout
// renders the shell and ModeView shows the page.
export const Route = createFileRoute('/_chat/pages/$pageId')({
  component: () => null,
})
