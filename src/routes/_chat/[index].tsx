import { createFileRoute } from '@tanstack/react-router'
import { z } from 'zod/v4'

// Index mode; the _chat layout renders the shell. The open view, item and
// collection live in the URL, so a view opens directly from a link.
export const Route = createFileRoute('/_chat/index')({
  validateSearch: z.object({
    view: z.string().optional(),
    item: z.string().optional(),
    collection: z.string().optional(),
  }),
  component: () => null,
})
