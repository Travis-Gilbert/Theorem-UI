// SOURCING: none — TanStack Start server route listing the committed stories for oracles (list_stories). The component stories are development only.
import { createFileRoute } from '@tanstack/react-router'
import { TERMINAL_STORIES } from '@/components/terminal/terminal-stories'
import { STORIES } from '@/stories/index'

export const Route = createFileRoute('/stories.json')({
  server: {
    handlers: {
      GET: () =>
        Response.json([
          ...TERMINAL_STORIES.map(({ id, title, claim, keys, click, running }) => ({
            id,
            title,
            claim,
            running,
            keys: keys ?? [],
            click,
            url: `/story/${id}`,
          })),
          ...(import.meta.env.DEV
            ? STORIES.map((story) => ({
                ...story,
                claim: story.title,
                running: false,
                keys: [],
                url: `/story/${story.id}`,
              }))
            : []),
        ]),
    },
  },
})
