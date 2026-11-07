// SOURCING: @tanstack/react-router file route, @tanstack/react-query's useIsFetching. An addressable, deterministic render of one component over committed fixtures, the story contract ui-graph-plans asks for. No upstream story tool here: Storybook would be a second build of this app's providers and routes, and these render inside the real ones.
import { useIsFetching } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Suspense, lazy, useEffect, useState } from 'react'
import { installFakeTheorem } from '@/stories/fake-theorem'
import { findStory } from '@/stories/index'
import { storyRoutes } from '@/stories/routes'

const Registry = import.meta.env.DEV
  ? lazy(async () => {
      const { REGISTRY } = await import('@/stories/registry')
      return {
        default: ({ id }: { id: string }) => {
          const Story = REGISTRY[id]
          return Story ? <Story /> : <p>This story has no render yet.</p>
        },
      }
    })
  : () => null

export const Route = createFileRoute('/story/$id')({
  ssr: false,
  params: {
    parse: ({ id }) => {
      const threadId = findStory(id)?.threadId
      return threadId ? { id, threadId } : { id }
    },
    stringify: ({ id }) => ({ id }),
  },
  beforeLoad: ({ params }) => {
    if (!import.meta.env.DEV || !findStory(params.id)) throw notFound()
  },
  component: StoryPage,
})

function StoryPage() {
  const { id } = Route.useParams()
  // Installed before the story's first query runs, and left in place for its life.
  useState(() => {
    installFakeTheorem(storyRoutes(Date.now()))
  })
  return (
    <div data-story={id} className="min-h-dvh bg-background text-ink">
      <Suspense>
        <Registry id={id} />
        <StoryReady />
      </Suspense>
    </div>
  )
}

/** Tells the oracle the fixtures have landed and the fonts have loaded. */
function StoryReady() {
  const fetching = useIsFetching()
  const [settled, setSettled] = useState(false)
  const [lastFetching, setLastFetching] = useState(fetching)
  if (lastFetching !== fetching) {
    setLastFetching(fetching)
    setSettled(false)
  }
  useEffect(() => {
    if (fetching > 0) return
    let live = true
    let timer: ReturnType<typeof setTimeout> | undefined
    // A quiet moment, since a query can start the commit after another ends.
    void document.fonts.ready.then(() => {
      if (live) timer = setTimeout(() => setSettled(true), 400)
    })
    return () => {
      live = false
      clearTimeout(timer)
    }
  }, [fetching])
  return settled ? <span hidden data-story-ready /> : null
}
