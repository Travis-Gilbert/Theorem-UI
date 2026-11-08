// A story is one component in one fixed state at /story/<id>: the file
// src/stories/<id>.story.tsx, default-exporting the render. /stories.json
// lists them (see vite.config.ts). Stories are what the visual checks drive.
import { Suspense, lazy } from 'react'
import type { ComponentType } from 'react'

const modules: Record<string, () => Promise<{ default: ComponentType }>> =
  import.meta.env.PROD && import.meta.env.MODE === 'production'
    ? {}
    : import.meta.glob<{ default: ComponentType }>('./*.story.tsx')

const stories = Object.fromEntries(
  Object.entries(modules).map(([file, load]) => [
    file.replace('./', '').replace('.story.tsx', ''),
    lazy(load),
  ]),
)

export function StoryRoute({ id }: { id: string }) {
  const Story = stories[id]
  if (!Story)
    return (
      <main className="p-10">
        <p className="text-xl font-semibold">No story named {id}.</p>
        <p className="mt-2 text-muted-ink">
          Stories: {Object.keys(stories).sort().join(', ') || 'none yet'}
        </p>
      </main>
    )
  return (
    <Suspense>
      <div data-story={id}>
        <Story />
      </div>
    </Suspense>
  )
}
