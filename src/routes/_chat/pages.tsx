import { createFileRoute } from '@tanstack/react-router'

// Pages mode with no page open; the _chat layout renders the shell.
export const Route = createFileRoute('/_chat/pages')({
  component: () => null,
})
