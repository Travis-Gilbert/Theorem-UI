// SOURCING: zustand (toggle state the composer and the runtime share), Base UI Toggle, ui/tooltip over Base UI Tooltip, assistant-ui composer scope (useAui)
import { useAui } from '@assistant-ui/react'
import { Toggle } from '@base-ui/react/toggle'
import { create } from 'zustand'
import { Icon } from '@/components/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'

export type ComposerTool = 'web' | 'diagram'

type ComposerToolsState = Readonly<Record<ComposerTool, boolean>> & {
  toggle: (tool: ComposerTool) => void
}

/**
 * Tools the next turn asks for. A toggle stays on across sends until the
 * person turns it off, as a mode of the conversation rather than of one
 * message.
 */
export const useComposerTools = create<ComposerToolsState>()((set) => ({
  web: false,
  diagram: false,
  toggle: (tool) => set((s) => ({ [tool]: !s[tool] })),
}))

const TOOLS = [
  {
    tool: 'web',
    label: 'Web',
    on: 'Web search on',
    off: 'Search the web',
    Mark: Icon.Web,
  },
  {
    tool: 'diagram',
    label: 'Diagram',
    on: 'Diagram requested',
    off: 'Ask for a diagram',
    Mark: Icon.Diagram,
  },
] as const

/**
 * The line a request toggle adds to the message it is on for. It is part of
 * the message, so the transcript shows what was asked.
 *
 * Web stays a request rather than a capability scope. Theorem admits its
 * `web_search` tool only on public-visitor runs; on an owner run
 * `capabilityScope` can only narrow the coding-turn catalog, which has no web
 * search, so sending `["web_search"]` would strip the run to its workspace
 * tool. When the authority admits web search on owner runs, the toggle can
 * pass it through the chat adapter's turn options instead.
 */
const REQUESTS: Readonly<Record<ComposerTool, string>> = {
  web: 'Search the web for this.',
  diagram: 'Show this as a diagram.',
}

/**
 * Submit handler for the thread composer: appends the request line of every
 * toggle that is on before the composer sends. A message that already ends
 * with a line, as an edited one can, does not get it twice.
 */
export function useComposerRequests() {
  const aui = useAui()
  return () => {
    const tools = useComposerTools.getState()
    const text = aui.composer.getState().text.trimEnd()
    const lines = TOOLS.filter(({ tool }) => tools[tool])
      .map(({ tool }) => REQUESTS[tool])
      .filter((line) => !text.endsWith(line))
    if (!text || !lines.length) return
    aui.composer.setText([text, ...lines].join('\n\n'))
  }
}

/** Web and Diagram, beside the attachment button. */
export function ComposerTools() {
  const tools = useComposerTools()
  return (
    <TooltipProvider>
      {TOOLS.map(({ tool, label, on, off, Mark }) => (
        <Tooltip key={tool}>
          <TooltipTrigger
            render={
              <Toggle
                pressed={tools[tool]}
                onPressedChange={() => tools.toggle(tool)}
                aria-label={off}
                className="flex h-7 items-center gap-1.5 rounded-md px-1.5 text-sm text-ink-muted transition-colors duration-100 outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-pressed:bg-redwood/15 data-pressed:text-redwood"
              />
            }
          >
            <Mark className="size-4" />
            {tools[tool] && <span className="pe-0.5">{label}</span>}
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {tools[tool] ? on : off}
          </TooltipContent>
        </Tooltip>
      ))}
    </TooltipProvider>
  )
}
