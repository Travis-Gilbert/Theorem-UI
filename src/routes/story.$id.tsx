// SOURCING: @tanstack/react-router file route; the terminal is terminal-screen's TerminalScreen (the real Ratzilla WASM build) on a committed fixture from terminal-stories
import { createFileRoute, notFound } from '@tanstack/react-router'
import { useEffect, useState } from 'react'
import {
  showStory,
  TerminalScreen,
} from '@/components/terminal/terminal-screen'
import type { TerminalAction } from '@/components/terminal/terminal-screen'
import {
  storySnapshot,
  TERMINAL_STORIES,
} from '@/components/terminal/terminal-stories'

/**
 * One story: a component in one fixed state at a fixed size, for oracles to
 * screenshot and diff. Listed at /stories.json. The last action the terminal
 * emitted is kept on `data-action`, for interaction oracles; nothing runs it.
 */
export const Route = createFileRoute('/story/$id')({
  // The terminal is WebAssembly drawing into the DOM; there is nothing to render on the server.
  ssr: false,
  loader: ({ params }) => {
    const story = TERMINAL_STORIES.find((s) => s.id === params.id)
    if (!story) throw notFound()
    return { id: story.id, title: story.title, snapshot: storySnapshot(story) }
  },
  head: ({ loaderData }) => ({
    meta: [{ title: `${loaderData?.title ?? 'Story'} · Theorem stories` }],
  }),
  component: Story,
})

function Story() {
  const { id, title, snapshot } = Route.useLoaderData()
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
