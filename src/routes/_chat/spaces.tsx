import { createFileRoute } from '@tanstack/react-router'

// Spaces mode; the _chat layout renders the shell and keeps the last chat open.
export const Route = createFileRoute('/_chat/spaces')({
  component: () => null,
})
