// SOURCING: @cosmos.gl/graph (MIT: the GPU force layout and renderer under
// Cosmograph, whose own packages are CC-BY-NC and so not usable here) draws and
// simulates the graph; @interacta/css-labels (the label layer cosmos.gl's own
// examples use) places labels without overlap; next-themes (repaint on a theme
// change); the graph model (lib/vault/graph-model.ts) over useIndexQuery
// (react-query) and the workspace tree; openFileAt, openSearch and
// openOrCreate for what a click opens.
import { Graph, getRgbaColor } from '@cosmos.gl/graph'
import { LabelRenderer } from '@interacta/css-labels'
import type { LabelOptions } from '@interacta/css-labels'
import { useTheme } from 'next-themes'
import { extname } from 'pathe'
import { useEffect, useEffectEvent, useMemo, useRef, useState } from 'react'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { openSearch } from '@/components/workspace/search-dialog'
import { attempt } from '@/components/workspace/workspace-tree'
import { openFileAt } from '@/lib/handlers/actions'
import { buildGraph, isNoteNode } from '@/lib/vault/graph-model'
import type {
  GraphModel,
  GraphNode,
  GraphNodeKind,
} from '@/lib/vault/graph-model'
import { openOrCreate } from '@/lib/workspace/notes'
import type { WorkspaceClient } from '@/lib/workspace/types'
import {
  useIndexQuery,
  useWorkspaceClient,
  useWorkspaceTree,
  useWorkspaces,
  workspaceClient,
} from '@/lib/workspace/workspaces'
import { cn } from '@/lib/utils'
import { Empty } from './vault-panels'
import { useVaultFile, useVaultPrefs } from './vault-state'
import type { GraphSettings } from './vault-state'

const SPACE = 4096
const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5))

type Rgba = [number, number, number, number]
type Palette = Record<GraphNodeKind | 'link' | 'active', Rgba> & {
  label: string
}

/** The graph's colours from the --graph-* tokens, which switch with the theme. */
function readPalette(element: HTMLElement): Palette {
  const style = getComputedStyle(element)
  const token = (name: string) =>
    style.getPropertyValue(`--graph-${name}`).trim()
  const rgba = (name: string) => getRgbaColor(token(name))
  return {
    note: rgba('note'),
    plan: rgba('plan'),
    agent: rgba('agent'),
    tag: rgba('tag'),
    attachment: rgba('attachment'),
    unresolved: rgba('unresolved'),
    link: rgba('link'),
    active: rgba('active'),
    label: token('label'),
  }
}

/**
 * Where the simulation starts: linked nodes in a disc at the centre, the
 * unlinked ones on a ring around it, the shape Obsidian's graph settles into.
 * Golden-angle spacing makes the same notes start in the same places.
 */
function seedPositions({ nodes }: GraphModel) {
  const positions = new Float32Array(nodes.length * 2)
  const linked = nodes.flatMap((node, i) => (node.degree ? [i] : []))
  const unlinked = nodes.flatMap((node, i) => (node.degree ? [] : [i]))
  const centre = SPACE / 2
  const place = (i: number, radius: number, angle: number) => {
    positions[2 * i] = centre + radius * Math.cos(angle)
    positions[2 * i + 1] = centre + radius * Math.sin(angle)
  }
  linked.forEach((i, k) =>
    place(
      i,
      SPACE * 0.04 * Math.sqrt((k + 0.5) / linked.length),
      k * GOLDEN_ANGLE,
    ),
  )
  unlinked.forEach((i, k) =>
    place(
      i,
      SPACE * (0.07 + 0.008 * Math.sin(k * GOLDEN_ANGLE)),
      (2 * Math.PI * k) / unlinked.length,
    ),
  )
  return positions
}

/** Bigger the more a node links, as in Obsidian. */
const pointSize = (node: GraphNode) =>
  (isNoteNode(node) ? 4 : 3) + Math.sqrt(node.degree) * 1.8

/** Labels fade in as the view zooms past the fitted scale. */
const labelOpacity = (zoom: number, fitted: number) =>
  Math.min(1, Math.max(0, (zoom / fitted - 1.4) / 0.8))

interface View {
  graph: Graph
  labels: LabelRenderer
  palette: Palette
  /** The zoom fitView last chose. */
  fitted: number
  /** Whether the camera still follows the settling layout: until the user pans or zooms. */
  following: boolean
  /** When the camera last refitted while following. */
  lastFit: number
}

function GraphCanvas({
  model,
  focus,
  onPick,
  controls,
}: {
  model: GraphModel
  /** The id of the node to ring: the open note. */
  focus: string | undefined
  onPick: (node: GraphNode) => void
  /** The filters, in the row the fit button ends. */
  controls: React.ReactNode
}) {
  const frame = useRef<HTMLDivElement>(null)
  const canvasHost = useRef<HTMLDivElement>(null)
  const labelHost = useRef<HTMLDivElement>(null)
  const view = useRef<View | null>(null)
  /** cosmos.gl sets up its WebGL device asynchronously; data waits for it. */
  const [ready, setReady] = useState(false)
  const hovered = useRef<{ index: number; near: Set<number> } | null>(null)
  const { resolvedTheme } = useTheme()

  const focusIndex = useMemo(() => {
    const index = model.nodes.findIndex((node) => node.id === focus)
    return index < 0 ? undefined : index
  }, [model, focus])

  const drawLabels = useEffectEvent(() => {
    const current = view.current
    if (!current) return
    const { graph, labels, palette } = current
    const zoom = graph.getZoomLevel()
    const faded = labelOpacity(zoom, current.fitted)
    const positions = graph.getPointPositions()
    const shown = new Map<number, number>()
    if (faded > 0)
      for (const index of graph.getSampledPointPositionsMap().keys())
        shown.set(index, hovered.current ? faded * 0.25 : faded)
    for (const index of hovered.current?.near ?? []) shown.set(index, 1)
    if (focusIndex !== undefined && !hovered.current) shown.set(focusIndex, 1)

    const options: Array<LabelOptions> = []
    for (const [index, opacity] of shown) {
      const node = model.nodes[index]
      const x = positions[2 * index]
      const y = positions[2 * index + 1]
      if (!node || x === undefined || y === undefined) continue
      const [screenX, screenY] = graph.spaceToScreenPosition([x, y])
      const radius = graph.spaceToScreenRadius(
        graph.getPointRadiusByIndex(index) ?? 0,
      )
      options.push({
        id: node.id,
        text: node.label,
        x: screenX,
        y: screenY + radius + 17,
        opacity,
        color: palette.label,
        fontSize: 12,
        weight: node.degree + (opacity === 1 ? 1000 : 0),
      })
    }
    labels.setLabels(options)
    labels.draw(true)
  })

  const hover = useEffectEvent((index: number | undefined) => {
    const graph = view.current?.graph
    if (!graph) return
    if (index === undefined) {
      hovered.current = null
      graph.setConfigPartial({ highlightedPointIndices: undefined })
    } else {
      const near = new Set([index, ...graph.getNeighboringPointIndices(index)])
      hovered.current = { index, near }
      graph.setConfigPartial({ highlightedPointIndices: [...near] })
    }
    drawLabels()
  })

  /** Keep the settling layout in view, as Obsidian's camera does. */
  const follow = useEffectEvent((settled: boolean) => {
    const current = view.current
    if (!current?.following) return
    const now = performance.now()
    if (!settled && now - current.lastFit < 300) return
    current.lastFit = now
    current.graph.fitView(settled ? 400 : 300, 0.12)
    window.setTimeout(
      () => {
        if (view.current !== current) return
        current.fitted = current.graph.getZoomLevel()
        drawLabels()
      },
      settled ? 450 : 350,
    )
  })

  const pick = useEffectEvent((index: number) => {
    const node = model.nodes[index]
    if (node) onPick(node)
  })

  useEffect(() => {
    const graph = new Graph(canvasHost.current, {
      backgroundColor: [0, 0, 0, 0],
      spaceSize: SPACE,
      scalePointsOnZoom: false,
      pointGreyoutOpacity: 0.12,
      linkGreyoutOpacity: 0.05,
      linkDefaultWidth: 1,
      linkOpacity: 0.85,
      hoveredPointCursor: 'pointer',
      enableDrag: true,
      simulationGravity: 0.2,
      simulationRepulsion: 3,
      simulationLinkSpring: 1,
      simulationLinkDistance: 40,
      simulationFriction: 0.85,
      simulationDecay: 4000,
      fitViewOnInit: false,
      attribution: '',
      onPointClick: (index) => pick(index),
      onPointMouseOver: (index) => hover(index),
      onPointMouseOut: () => hover(undefined),
      onSimulationTick: () => {
        follow(false)
        drawLabels()
      },
      onSimulationEnd: () => follow(true),
      onZoomStart: (_event, userDriven) => {
        if (userDriven && view.current) view.current.following = false
      },
      onZoom: () => drawLabels(),
      onDrag: () => drawLabels(),
    })
    const labels = new LabelRenderer(labelHost.current!, {
      pointerEvents: 'none',
    })
    view.current = {
      graph,
      labels,
      palette: readPalette(frame.current!),
      fitted: 1,
      following: true,
      lastFit: 0,
    }
    let live = true
    void graph.ready.then(() => live && setReady(true))
    // A resized panel refits once the dragging stops, unless the person has moved the view.
    let settle: number | undefined
    const resized = new ResizeObserver(() => {
      window.clearTimeout(settle)
      settle = window.setTimeout(() => follow(true), 150)
    })
    resized.observe(frame.current!)
    return () => {
      live = false
      resized.disconnect()
      window.clearTimeout(settle)
      setReady(false)
      view.current = null
      labels.destroy()
      graph.destroy()
    }
  }, [])

  // New data starts a new layout; the camera follows it while it settles.
  useEffect(() => {
    const current = view.current
    if (!current || !ready) return
    const { graph } = current
    hovered.current = null
    current.following = true
    current.lastFit = 0
    const seeded = seedPositions(model)
    graph.setPointPositions(seeded)
    graph.setLinks(new Float32Array(model.links.flat()))
    graph.setPointSizes(new Float32Array(model.nodes.map(pointSize)))
    graph.setConfigPartial({ highlightedPointIndices: undefined })
    graph.render(1, 0)
    graph.fitViewByPointPositions([...seeded], 0, 0.12)
    graph.start(1)
  }, [model, ready])

  // Colours follow the theme and ring the open note.
  useEffect(() => {
    const current = view.current
    if (!current || !ready) return
    const palette = readPalette(frame.current!)
    current.palette = palette
    const colors = new Float32Array(model.nodes.length * 4)
    model.nodes.forEach((node, i) =>
      colors.set(i === focusIndex ? palette.active : palette[node.kind], 4 * i),
    )
    current.graph.setPointColors(colors)
    current.graph.setConfigPartial({
      linkDefaultColor: palette.link,
      focusedPointIndex: focusIndex,
      focusedPointRingColor: palette.active,
    })
    current.graph.render(undefined, 0)
    drawLabels()
  }, [model, focusIndex, resolvedTheme, ready])

  return (
    <div ref={frame} className="vault-graph absolute inset-0">
      <div ref={canvasHost} className="absolute inset-0" />
      <div ref={labelHost} className="pointer-events-none absolute inset-0" />
      <div className="pointer-events-none absolute inset-x-2 top-2 flex items-start justify-between gap-2">
        {controls}
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label="Fit to view"
          title="Fit to view"
          className="pointer-events-auto bg-artifact/85 backdrop-blur-sm"
          onClick={() => {
            const current = view.current
            if (!current) return
            // Labels redraw from the zoom events the fit sends.
            current.following = true
            current.graph.fitView(400, 0.12)
            window.setTimeout(() => {
              current.fitted = current.graph.getZoomLevel()
            }, 450)
          }}
        >
          <Icon.Expand />
        </Button>
      </div>
    </div>
  )
}

const FILTERS: Array<{ key: keyof GraphSettings; label: string }> = [
  { key: 'tags', label: 'Tags' },
  { key: 'attachments', label: 'Attachments' },
  { key: 'orphans', label: 'Orphans' },
  { key: 'unresolved', label: 'Unresolved' },
]

const chip =
  'h-6 rounded-md px-2 text-xs text-ink-faint outline-none transition-colors duration-100 hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus aria-pressed:bg-pill aria-pressed:text-ink'

function Controls({ local }: { local: boolean }) {
  const settings = useVaultPrefs((s) => s.graph)
  const setGraph = useVaultPrefs((s) => s.setGraph)
  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-0.5 rounded-lg bg-artifact/85 p-0.5 backdrop-blur-sm">
      <button
        type="button"
        aria-pressed={!settings.local}
        className={chip}
        onClick={() => setGraph({ local: false })}
      >
        Global
      </button>
      <button
        type="button"
        aria-pressed={settings.local}
        disabled={!local}
        title={local ? undefined : 'Open a note for its local graph'}
        className={cn(chip, 'disabled:opacity-50')}
        onClick={() => setGraph({ local: true })}
      >
        Local
      </button>
      {settings.local && local && (
        <label className="flex h-6 items-center gap-1 px-1.5 text-xs text-ink-faint">
          Depth
          <input
            type="number"
            min={1}
            max={5}
            value={settings.depth}
            onChange={(event) =>
              setGraph({
                depth: Math.min(5, Math.max(1, Number(event.target.value))),
              })
            }
            className="w-8 rounded bg-transparent text-center text-ink tabular-nums outline-none focus-visible:outline-2 focus-visible:outline-focus"
          />
        </label>
      )}
      <span aria-hidden="true" className="mx-0.5 h-4 w-px bg-separator" />
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={Boolean(settings[key])}
          className={chip}
          onClick={() => setGraph({ [key]: !settings[key] })}
        >
          {label}
        </button>
      ))}
    </div>
  )
}

const LEGEND: Array<{ kind: GraphNodeKind; label: string }> = [
  { kind: 'note', label: 'Notes' },
  { kind: 'plan', label: 'Plans' },
  { kind: 'agent', label: 'By agents' },
  { kind: 'tag', label: 'Tags' },
  { kind: 'attachment', label: 'Attachments' },
  { kind: 'unresolved', label: 'Unresolved' },
]

function WorkspaceGraphView({
  client,
  focus,
}: {
  client: WorkspaceClient
  focus: string | undefined
}) {
  const graph = useIndexQuery(client, ['graph'], () => client.graph())
  const tree = useWorkspaceTree(client)
  const settings = useVaultPrefs((s) => s.graph)
  const model = useMemo(() => {
    if (!graph.data) return undefined
    const files = (tree.data ?? [])
      .filter((entry) => entry.kind === 'file')
      .map((entry) => entry.path)
    return buildGraph(graph.data, files, {
      ...settings,
      local:
        settings.local && focus
          ? { path: focus, depth: settings.depth }
          : undefined,
    })
  }, [graph.data, tree.data, settings, focus])

  const onPick = (node: GraphNode) => {
    if (node.path) openFileAt({ client, path: node.path })
    else if (node.kind === 'tag') openSearch(`tag:#${node.target}`)
    else if (node.target) {
      const target = node.target
      void attempt(
        client.workspace.id,
        () =>
          openOrCreate(client, extname(target) ? target : `${target}.md`),
        () => `“${target}” could not be made.`,
      )
    }
  }

  if (graph.isError) return <Empty>The graph could not be read.</Empty>
  if (!model) return <Empty>Loading…</Empty>
  const shown = new Set(model.nodes.map((node) => node.kind))
  return (
    <div className="relative h-full overflow-hidden">
      <GraphCanvas
        model={model}
        focus={focus}
        onPick={onPick}
        controls={<Controls local={Boolean(focus)} />}
      />
      <div className="pointer-events-none absolute start-3 bottom-2 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-ink-faint">
        {LEGEND.filter(({ kind }) => shown.has(kind)).map(({ kind, label }) => (
          <span key={kind} className="flex items-center gap-1">
            <span
              aria-hidden="true"
              className="size-2 rounded-full"
              style={{ background: `var(--graph-${kind})` }}
            />
            {label}
          </span>
        ))}
        <span className="tabular-nums">
          {model.nodes.length} nodes · {model.links.length} links
        </span>
      </div>
      {!model.nodes.length && (
        <div className="absolute inset-0 flex items-center justify-center">
          <Empty>Nothing to show with these filters.</Empty>
        </div>
      )}
    </div>
  )
}

/**
 * The graph of the folder the open note is in, else of the first open
 * folder: every note, and by default its tags and attachments, linked as the
 * notes link them. The open note is ringed; hovering a node lights it and its
 * neighbours; a click opens what the node stands for.
 */
export function GraphPanel() {
  const file = useVaultFile((s) => s.file)
  const first = useWorkspaces().workspaces[0]
  const followed = useWorkspaceClient(file?.workspaceId ?? '')
  const client = followed ?? (first && workspaceClient(first))
  if (!client) return <Empty>Open a folder to see its graph.</Empty>
  return (
    <WorkspaceGraphView
      key={client.workspace.id}
      client={client}
      focus={followed ? file?.path : undefined}
    />
  )
}
