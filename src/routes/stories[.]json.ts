// SOURCING: none — TanStack Start server route listing the committed stories for oracles (list_stories)
import { createFileRoute } from '@tanstack/react-router'
import { TERMINAL_STORIES } from '@/components/terminal/terminal-stories'

export const Route = createFileRoute('/stories.json')({
  server: {
    handlers: {
      GET: () =>
        Response.json(
          TERMINAL_STORIES.map(({ id, title, claim, keys, click }) => ({
            id,
            title,
            claim,
            keys: keys ?? [],
            click,
            url: `/story/${id}`,
          })),
        ),
    },
  },
})
