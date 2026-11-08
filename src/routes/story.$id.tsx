// SOURCING: @tanstack/react-router file route, @tanstack/react-query's useIsFetching; the terminal is terminal-screen's TerminalScreen (the real Ratzilla WASM build) on a committed fixture from terminal-stories. An addressable, deterministic render of one component over committed fixtures, the story contract ui-graph-plans asks for. No upstream story tool here: Storybook would be a second build of this app's providers and routes, and these render inside the real ones.
import { useIsFetching } from '@tanstack/react-query'
import { createFileRoute, notFound } from '@tanstack/react-router'
import { Suspense, lazy, useEffect, useState } from 'react'
import {
  showStory,
  TerminalScreen,
} from '@/components/terminal/terminal-screen'
import type { TerminalAction } from '@/components/terminal/terminal-screen'
import {
  storySnapshot,
  TERMINAL_STORIES,
} from '@/components/terminal/terminal-stories'
import { installFakeTheorem } from '@/stories/fake-theorem'
import { findStory } from '@/stories/index'
import { storyRoutes } from '@/stories/routes'

const Registry = import.meta.env.DEV
  ? lazy(async () => {
      const { REGISTRY } = await import('@/stories/registry')
      return {
        default: ({ id }: { id: string }) => {
          const Render = REGISTRY[id]
          return Render ? <Render /> : <p>This story has no render yet.</p>
        },
      }
    })
  : () => null

/**
 * One story: a component in one fixed state at a fixed size, for oracles to
 * screenshot and diff. Listed at /stories.json. A terminal story keeps the last
 * action the terminal emitted on `data-action`, for interaction oracles; nothing
 * runs it. The other stories render over a fake Theorem and are development only.
 */
export const Route = createFileRoute('/story/$id')({
  // The terminal is WebAssembly drawing into the DOM, and the other stories
  // read a fake Theorem installed in the browser; nothing renders on the server.
  ssr: false,
  params: {
    // A story set in a thread selects it in the sidebar, the way a route would.
    parse: ({ id }) => {
      const threadId = findStory(id)?.threadId
      return threadId ? { id, threadId } : { id }
    },
    stringify: ({ id }) => ({ id }),
  },
  loader: ({ params }) => {
    const terminal = TERMINAL_STORIES.find((s) => s.id === params.id)
    if (terminal) {
      return {
        kind: 'terminal' as const,
        id: terminal.id,
        title: terminal.title,
        snapshot: storySnapshot(terminal),
      }
    }
    const story = import.meta.env.DEV ? findStory(params.id) : undefined
    if (!story) throw notFound()
    return { kind: 'component' as const, id: story.id, title: story.title }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? 'Story'} · Theorem stories` }],
  }),
  component: Story,
})

function Story() {
  const story = Route.useLoaderData()
  return story.kind === 'terminal' ? (
    <TerminalStory
      id={story.id}
      title={story.title}
      snapshot={story.snapshot}
    />
  ) : (
    <ComponentStory id={story.id} />
  )
}

function TerminalStory({
  id,
  title,
  snapshot,
}: {
  id: string
  title: string
  snapshot: ReturnType<typeof storySnapshot>
}) {
  const key = `story:${id}`
  const [action, setAction] = useState<TerminalAction>()
  useEffect(() => showStory(key, snapshot), [key, snapshot])
  return (
    <main
      data-story={id}
      data-action={action && JSON.stringify(action)}
      className="flex h-[640px] w-[900px] flex-col overflow-hidden"
    >
      <TerminalScreen
        hostId={`story-terminal-${id}`}
        tabbed={false}
        tabs={[{ id: key, title }]}
        active={key}
        onAction={setAction}
      />
    </main>
  )
}

function ComponentStory({ id }: { id: string }) {
  // Installed before the story's first query runs, and taken out when the story
  // closes, so the app it links into reaches Theorem again.
  const [restore] = useState(() => installFakeTheorem(storyRoutes(Date.now())))
  useEffect(() => restore, [restore])
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
