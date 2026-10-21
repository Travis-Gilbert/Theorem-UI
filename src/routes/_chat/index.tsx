import { createFileRoute } from '@tanstack/react-router'

// A new conversation; the _chat layout renders the shell.
export const Route = createFileRoute('/_chat/')({ component: () => null })
