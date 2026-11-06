// SOURCING: zustand (toggle state the composer and the runtime share), coss ui Menu over Base UI Menu (the Tools button and its list of checkbox items), Base UI Toggle (the chip that shows a tool is on), ui/tooltip over Base UI Tooltip, assistant-ui composer scope (useAui), the shared useSpin over anime.js
import { useAui } from '@assistant-ui/react'
import { Toggle } from '@base-ui/react/toggle'
import { useRef } from 'react'
import type { ComponentProps } from 'react'
import { create } from 'zustand'
import {
  Menu,
  MenuCheckboxItem,
  MenuPopup,
  MenuTrigger,
} from '@/components/coss/menu'
import { Icon } from '@/components/icons'
import { useSpin } from '@/components/motion'
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

/** The web mark turns while the pointer rests on its toggle, faster on a press. */
function WebMark(props: ComponentProps<'svg'>) {
  const ref = useRef<SVGSVGElement>(null)
  useSpin(ref)
  return <Icon.Web ref={ref} {...props} />
}

const TOOLS = [
  {
    tool: 'web',
    label: 'Web',
    on: 'Web search on',
    off: 'Search the web',
    Mark: WebMark,
    ListMark: Icon.Web,
  },
  {
    tool: 'diagram',
    label: 'Diagram',
    on: 'Diagram requested',
    off: 'Ask for a diagram',
    Mark: Icon.Diagram,
    ListMark: Icon.Diagram,
  },
] as const

/**
 * The line a request toggle adds to the message it is on for. It is part of
 * the message, so the transcript shows what was asked.
 *
 * Web expresses intent, not a capability restriction. Narrowing
 * capabilityScope here could remove other tools needed by the turn.
 */
const REQUESTS: Readonly<Record<ComposerTool, string>> = {
  web: 'Search the web for this.',
  diagram: 'Show this as a diagram.',
}

/**
 * Submit handler for the thread composer: appends the request line of every
 * toggle that is on before the composer sends. A message that already contains
 * a request line, as an edited one can, does not get it twice.
 */
export function useComposerRequests() {
  const aui = useAui()
  return () => {
    const tools = useComposerTools.getState()
    const text = aui.composer.getState().text.trimEnd()
    const existing = new Set(text.split('\n').map((line) => line.trim()))
    const lines = TOOLS.filter(({ tool }) => tools[tool])
      .map(({ tool }) => REQUESTS[tool])
      .filter((line) => !existing.has(line))
    if (!text || !lines.length) return
    aui.composer.setText([text, ...lines].join('\n\n'))
  }
}

/** The composer's buttons are passed on the way to typing, so their tooltips wait for a resting pointer. */
export const COMPOSER_TOOLTIP_DELAY = 700

const CONTROL =
  'flex h-8 items-center gap-1.5 rounded-md px-2 text-sm transition-colors duration-100 outline-none focus-visible:outline-2 focus-visible:outline-focus'

/**
 * The Tools button beside the attachment button, and its list. A tool that is
 * on shows as a chip after the button, so the person sees what the next turn
 * asks for and can turn it off without opening the list.
 */
export function ComposerTools() {
  const tools = useComposerTools()
  return (
    <>
      <Menu>
        <MenuTrigger
          className={`${CONTROL} text-ink-muted hover:bg-hover hover:text-ink data-popup-open:bg-hover data-popup-open:text-ink`}
        >
          <Icon.Tools className="size-4" />
          <span className="pe-0.5">Tools</span>
        </MenuTrigger>
        <MenuPopup side="top" align="start" className="w-56">
          {TOOLS.map(({ tool, off, ListMark }) => (
            <MenuCheckboxItem
              key={tool}
              checked={tools[tool]}
              onCheckedChange={() => tools.toggle(tool)}
            >
              <span className="flex items-center gap-2">
                <ListMark className="size-4" />
                {off}
              </span>
            </MenuCheckboxItem>
          ))}
        </MenuPopup>
      </Menu>
      <TooltipProvider>
        {TOOLS.filter(({ tool }) => tools[tool]).map(
          ({ tool, label, on, off, Mark }) => (
            <Tooltip key={tool}>
              <TooltipTrigger
                delay={COMPOSER_TOOLTIP_DELAY}
                render={
                  <Toggle
                    pressed
                    onPressedChange={() => tools.toggle(tool)}
                    aria-label={off}
                    className={`${CONTROL} bg-redwood/15 text-redwood hover:bg-redwood/25`}
                  />
                }
              >
                <Mark className="size-4" />
                <span className="pe-0.5">{label}</span>
              </TooltipTrigger>
              <TooltipContent side="bottom">{on}. Click to turn off.</TooltipContent>
            </Tooltip>
          ),
        )}
      </TooltipProvider>
    </>
  )
}
