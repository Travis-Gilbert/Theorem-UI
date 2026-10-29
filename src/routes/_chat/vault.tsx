import { createFileRoute } from '@tanstack/react-router'

// Vault mode; the _chat layout renders the shell and keeps the last chat open.
export const Route = createFileRoute('/_chat/vault')({
  component: () => null,
})
