// SOURCING: none: a TanStack Start server route listing the stories for the oracle. Development only.
import { createFileRoute } from '@tanstack/react-router'
import { STORIES } from '@/stories/index'

export const Route = createFileRoute('/stories.json')({
  server: {
    handlers: {
      GET: () =>
        import.meta.env.DEV
          ? Response.json(STORIES)
          : new Response(null, { status: 404 }),
    },
  },
})
