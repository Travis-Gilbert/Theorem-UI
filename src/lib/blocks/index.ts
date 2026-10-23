// SOURCING: React.lazy and Suspense (each view's code, with the compiler and
// runtime behind it, loads the first time a file or note needs it), as Phase
// 3's builtins.ts loads its handlers' views, and Milkdown's $view with the
// Markdown editor's @prosemirror-adapter/react factory for the live block's
// node view. What live blocks add to the file handlers (plan D13) and to the
// Markdown and code editors; the app registers them.
import type { Extension } from '@codemirror/state'
import type { Crepe } from '@milkdown/crepe'
import { $view } from '@milkdown/kit/utils'
import type { ReactNodeViewUserOptions } from '@prosemirror-adapter/react'
import type { NodeViewConstructor } from '@milkdown/kit/prose/view'
import { Suspense, createElement, lazy } from 'react'
import type { ComponentType } from 'react'
import { BlockMessage } from '@/components/blocks/block-status'
import { lastRunMargin } from '@/components/blocks/last-run-margin'
import type {
  FileHandler,
  FileViewProps,
  HandlerMatchInput,
  MarkdownExtension,
} from '@/lib/handlers/types'
import {
  LIVE_BLOCK_CONTROLS,
  liveBlockNode,
  liveBlockPlugins,
} from './milkdown'
import { runsAsTool } from './tools'

/**
 * Extra behaviour for the code handler's CodeMirror editor. The same shape as
 * the handler registry's CodeExtension (Phase 3's registry.ts), which this
 * branch does not have.
 */
export interface CodeExtension {
  id: string
  /** CodeMirror extensions for a code file's editor, e.g. last-run values in the gutter. */
  extensions: (file: FileViewProps) => Array<Extension>
  /** Controls in the code panel's toolbar, e.g. Run. */
  Toolbar?: ComponentType<FileViewProps>
}

/** A view whose code loads when it is first shown. */
function lazyView<TProps extends object>(
  load: () => Promise<ComponentType<TProps>>,
): ComponentType<TProps> {
  const View = lazy(async () => ({ default: await load() }))
  return function LazyView(props: TProps) {
    return createElement(
      Suspense,
      { fallback: createElement(BlockMessage, null, 'Loading…') },
      createElement(View, props),
    )
  }
}

const tool = () => import('@/components/blocks/tool-handler')
const htmlApp = () => import('@/components/blocks/html-app-handler')
const liveBlock = () => import('@/components/blocks/live-block-view')

const isFile = ({ entry }: HandlerMatchInput) => entry.kind === 'file'

const TOOL_TEMPLATE = `// uses:
// A tool shows what its default export renders. Declare what it reads or
// writes on the line above, such as files.read("Data/habits.csv"),
// state("habits") or net("api.example.com").

export default function Tool() {
  return <p>A new tool.</p>
}
`

const HTML_TEMPLATE = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <!--
      What the app reads or writes, such as files.read("Data/habits.csv"),
      state("habits") or net("api.example.com"). The app reaches them through
      window.theorem once window.theorem.ready resolves.
    -->
    <meta name="theorem:uses" content="" />
    <title>App</title>
  </head>
  <body>
    <p>A new app.</p>
  </body>
</html>
`

/**
 * The `.tsx` tool, the `.html` app and the folder app. A tool or page wins
 * over the code editor (priority 40), which stays in "Open with". The folder
 * app matches every folder: the contract's match input does not list a
 * folder's files, so a folder without `index.html` says so in its panel.
 */
export const blockHandlers: Array<FileHandler> = [
  {
    id: 'tool',
    label: 'Tool',
    priority: 60,
    match: (input) => input.extension === 'tsx' && isFile(input),
    Panel: lazyView(() => tool().then((m) => m.ToolPanel)),
    Card: lazyView(() => tool().then((m) => m.ToolCard)),
    create: { label: 'Tool', extension: 'tsx', initial: () => TOOL_TEMPLATE },
  },
  {
    id: 'html-app',
    label: 'HTML app',
    priority: 60,
    match: (input) =>
      (input.extension === 'html' || input.extension === 'htm') &&
      isFile(input),
    Panel: lazyView(() => htmlApp().then((m) => m.HtmlAppPanel)),
    Card: lazyView(() => htmlApp().then((m) => m.HtmlAppCard)),
    create: {
      label: 'HTML app',
      extension: 'html',
      initial: () => HTML_TEMPLATE,
    },
  },
  {
    id: 'html-folder',
    label: 'HTML app folder',
    priority: 10,
    match: ({ entry }) => entry.kind === 'directory',
    Panel: lazyView(() => htmlApp().then((m) => m.HtmlAppPanel)),
    Card: lazyView(() => htmlApp().then((m) => m.HtmlAppCard)),
  },
]

/** The Markdown editor's node view factory, set by Phase 3's editor. */
const NODE_VIEW_FACTORY = 'theoremNodeViewFactory'
type NodeViewFactory = (
  options: ReactNodeViewUserOptions,
) => NodeViewConstructor

const LiveBlockView = lazyView(() => liveBlock().then((m) => m.LiveBlockView))

/** Events inside a live block's own controls stay with React. */
const inControls = (event: Event) =>
  event.target instanceof Element &&
  event.target.closest(`[${LIVE_BLOCK_CONTROLS}]`) !== null

function liveBlockView(file: FileViewProps) {
  // One component per editor: every block in the note shares it.
  const component = () => createElement(LiveBlockView, { file })
  return $view(liveBlockNode, (ctx) => {
    const factory = ctx.isInjected(NODE_VIEW_FACTORY)
      ? ctx.get<NodeViewFactory | null, typeof NODE_VIEW_FACTORY>(
          NODE_VIEW_FACTORY,
        )
      : null
    if (!factory)
      throw new Error(
        `Live blocks need the Markdown editor's ${NODE_VIEW_FACTORY} slice.`,
      )
    return factory({ component, stopEvent: inControls })
  })
}

/**
 * Live blocks in the Markdown editor: `.live`, `query` and `agent` fences kept
 * byte for byte, shown with their source and result. Typing a fence opener
 * such as "```tsx {.live #name}" and a space makes one.
 */
export const liveBlocksExtension: MarkdownExtension = {
  id: 'live-blocks',
  extend: (crepe: Crepe, file: FileViewProps) => {
    crepe.editor.use(liveBlockPlugins).use(liveBlockView(file))
  },
}

const RunToolbar = lazy(() => tool().then((m) => ({ default: m.RunToolbar })))

/**
 * The code editor's Run control, and last-run values at the end of each line
 * of a TypeScript or JavaScript file. Other files load nothing.
 */
export const blockCodeExtension: CodeExtension = {
  id: 'blocks',
  extensions: (file) =>
    runsAsTool(file.path) ? [lastRunMargin(file.client.workspace.id)] : [],
  Toolbar: (file) =>
    runsAsTool(file.path)
      ? createElement(
          Suspense,
          { fallback: null },
          createElement(RunToolbar, file),
        )
      : null,
}
