import { createFileRoute } from '@tanstack/react-router'

// Notes mode; the _chat layout renders the shell and ModeView shows the notes.
export const Route = createFileRoute('/_chat/notes')({
  component: () => null,
})
