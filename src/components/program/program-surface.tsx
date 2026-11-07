// SOURCING: @tanstack/react-query (load; saves as one scoped mutation queue), coss ui Sidebar and Tabs (the side panel), the
// program canvas (React Flow). A standing program lives in Theorem; this surface
// opens one, saves edits back as drafts, and shows what its runs report.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useSearch } from '@tanstack/react-router'
import { useDebouncedValue } from '@tanstack/react-pacer'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ProgramDefinition } from '@/lib/program/contracts'
import type { ProgramLayout } from '@/lib/program/api'
import { lintProgram } from '@/lib/program/compute'
import type { LintDiagnostic, LintSeverity } from '@/lib/program/compute'
import type { ProgramNodeData } from '@/lib/program/flow'
import {
  loadProgram,
  programKeys,
  saveProgram,
  validateEdge,
  validateProgram,
} from '@/lib/program/api'
import { NativeToolError } from '@/lib/theorem/native'
import { layoutProgram } from '@/lib/program/flow'
import { reattachProgramRun, stopFollowing } from '@/lib/program/run'
import { sameDocument, useProgramDoc } from '@/lib/program/store'
import { describeError } from '@/lib/theorem/client'
import { Alert, AlertDescription } from '@/components/coss/alert'
import {
  Sidebar,
  SidebarContent,
  SidebarHeader,
  SidebarProvider,
} from '@/components/coss/sidebar'
import { Tabs, TabsList, TabsPanel, TabsTab } from '@/components/coss/tabs'
import { ComputePanel } from './compute-panel'
import { GraphsHome } from './graphs-home'
import { LifePanel } from './life-panel'
import { NodeInspector } from './node-inspector'
import { ProgramCanvas } from './program-canvas'
import { RunRail } from './run-rail'
import { ToolError } from './section'

/** What one save writes, taken when it is asked for. */
type SaveSnapshot = {
  program: ProgramDefinition
  layout: ProgramLayout
  nodeId: string | undefined
  definition: number
  still: () => boolean
}

/**
 * Edits save as they settle. Saves share one mutation scope, so they reach Theorem one
 * after another in the order they were asked for: the last edit is the last written,
 * and an older answer never lands after a newer one. `flush` saves at once whatever is
 * still waiting, for the moment the graph closes.
 */
function useAutosave() {
  const client = useQueryClient()
  const revision = useProgramDoc((doc) => doc.revision)
  const waiting = useRef<ReturnType<typeof setTimeout>>(undefined)
  const { mutate, error, reset } = useMutation({
    scope: { id: 'program-save' },
    mutationFn: (snapshot: SaveSnapshot) =>
      saveProgram(
        snapshot.program,
        snapshot.layout,
        // An earlier save in the queue may have given the open graph its id.
        snapshot.still() ? useProgramDoc.getState().nodeId : snapshot.nodeId,
      ),
    onSuccess: (saved, snapshot) => {
      void client.invalidateQueries({ queryKey: programKeys.list() })
      // A graph closed or replaced since keeps its own identity.
      if (!snapshot.still()) return
      useProgramDoc
        .getState()
        .saved(saved.node_id, saved.content_id, snapshot.definition)
    },
  })
  const save = useCallback(() => {
    const doc = useProgramDoc.getState()
    if (!doc.program) return
    reset()
    mutate({
      program: doc.program,
      layout: { ...doc.layout, nodes: doc.positions },
      nodeId: doc.nodeId,
      definition: doc.definitionRevision,
      still: sameDocument(),
    })
  }, [mutate, reset])
  useEffect(() => {
    if (revision === 0) return
    waiting.current = setTimeout(() => {
      waiting.current = undefined
      save()
    }, 700)
    return () => clearTimeout(waiting.current)
  }, [revision, save])
  const flush = useCallback(() => {
    if (waiting.current === undefined) return
    clearTimeout(waiting.current)
    waiting.current = undefined
    save()
  }, [save])
  return { error: error ? describeError(error) : undefined, flush }
}

const SEVERITY_ORDER: Array<LintSeverity> = ['error', 'warning', 'info']

/** Theorem lints the definition, so each finding lands on the node it names. */
function useProgramLint(nodeId: string) {
  const revision = useProgramDoc((doc) => doc.definitionRevision)
  const open = useProgramDoc((doc) => doc.program !== undefined)
  const [settled] = useDebouncedValue(revision, { wait: 500 })
  const lint = useQuery({
    queryKey: [...programKeys.all, 'lint', nodeId, settled],
    queryFn: () => lintProgram(useProgramDoc.getState().program!),
    enabled: open,
    retry: false,
  })
  useEffect(() => {
    if (!lint.data) return
    const byNode: Record<string, Array<LintDiagnostic>> = {}
    for (const diagnostic of lint.data.report.diagnostics) {
      ;(byNode[diagnostic.subject] ??= []).push(diagnostic)
    }
    useProgramDoc.getState().setDiagnostics(byNode)
  }, [lint.data])
}

/**
 * Whole-program validation follows the definition, not the layout: positions never
 * reach it. Anything short of Theorem's answer leaves the verdict undetermined.
 */
function useProgramValidation() {
  const revision = useProgramDoc((doc) => doc.definitionRevision)
  const open = useProgramDoc((doc) => doc.program !== undefined)
  const [settled] = useDebouncedValue(revision, { wait: 500 })
  useEffect(() => {
    const doc = useProgramDoc.getState()
    if (!doc.program) return
    let live = true
    doc.setVerdict(undefined)
    // Nothing on the canvas yet is a place to start, not a refusal.
    if (doc.program.nodes.length === 0) return
    validateProgram(doc.program)
      .then(() => {
        if (live) useProgramDoc.getState().setVerdict({ status: 'valid' })
      })
      .catch((failure: unknown) => {
        if (!live) return
        const answer =
          failure instanceof NativeToolError
            ? (failure.answer as { refusal?: { node_ids?: Array<string> } })
            : undefined
        useProgramDoc.getState().setVerdict({
          status: 'refused',
          code: failure instanceof NativeToolError ? failure.code : undefined,
          message: describeError(failure),
          nodeIds: answer?.refusal?.node_ids ?? [],
        })
      })
    return () => {
      live = false
    }
  }, [settled, open])
}

function OpenProgram({ nodeId }: { nodeId: string }) {
  const loaded = useQuery({
    queryKey: programKeys.load(nodeId),
    queryFn: () => loadProgram(nodeId),
    // The open document owns the program once it is on the canvas.
    refetchOnWindowFocus: false,
  })
  const program = useProgramDoc((doc) => doc.program)
  const openId = useProgramDoc((doc) => doc.nodeId)
  const receipt = useProgramDoc((doc) => doc.receipt)
  const pins = useProgramDoc((doc) => doc.layout.pins)
  const diagnostics = useProgramDoc((doc) => doc.diagnostics)
  const proposal = useProgramDoc((doc) => doc.proposal)
  const { error: saveError, flush } = useAutosave()
  const verdict = useProgramDoc((doc) => doc.verdict)
  useProgramLint(nodeId)
  useProgramValidation()

  useEffect(() => {
    const answer = loaded.data
    if (!answer) return
    let live = true
    void layoutProgram(answer.program, answer.layout).then((positions) => {
      if (!live) return
      useProgramDoc.getState().open(answer, positions)
      if (answer.layout?.last_run_id) {
        void reattachProgramRun(answer.layout.last_run_id)
      }
      const byId = new Map(answer.program.nodes.map((node) => [node.id, node]))
      void Promise.all(
        answer.program.edges.map(async (edge) => {
          const producer = byId
            .get(edge.from_node)
            ?.outputs.find((port) => port.id === edge.from_port)
          const consumer = byId
            .get(edge.to_node)
            ?.inputs.find((port) => port.id === edge.to_port)
          if (!producer || !consumer) return undefined
          return [edge.id, await validateEdge(producer, consumer)] as const
        }),
      ).then((pairs) => {
        if (live) {
          useProgramDoc
            .getState()
            .setVerdicts(
              Object.fromEntries(pairs.filter((pair) => pair !== undefined)),
            )
        }
      })
    })
    return () => {
      live = false
    }
  }, [loaded.data])
  useEffect(
    () => () => {
      flush()
      stopFollowing()
      useProgramDoc.getState().close()
    },
    [flush],
  )

  const extras = useMemo(() => {
    const out: Record<string, Partial<ProgramNodeData>> = {}
    for (const id of Object.keys(pins ?? {})) out[id] = { pinned: true }
    for (const inspection of Object.values(receipt?.inspections ?? {})) {
      out[inspection.node_id] = {
        ...out[inspection.node_id],
        pinned: inspection.pinned || out[inspection.node_id]?.pinned,
        stale: inspection.stale,
      }
    }
    for (const [id, found] of Object.entries(diagnostics)) {
      out[id] = {
        ...out[id],
        lint: SEVERITY_ORDER.find((severity) =>
          found.some((diagnostic) => diagnostic.severity === severity),
        ),
      }
    }
    if (verdict?.status === 'refused') {
      const unknown = verdict.code === 'program_unknown_block'
      for (const id of verdict.nodeIds) {
        out[id] = { ...out[id], refused: true, unknown }
      }
    }
    if (proposal?.diff) {
      for (const id of proposal.diff.node_ids_only_in_left) {
        out[id] = { ...out[id], proposed: 'removed' }
      }
      for (const id of proposal.diff.changed_node_ids) {
        out[id] = { ...out[id], proposed: 'changed' }
      }
    }
    return out
  }, [pins, receipt, diagnostics, verdict, proposal])

  if (loaded.isError) {
    return (
      <div className="p-6">
        <ToolError error={loaded.error} />
      </div>
    )
  }
  if (!program || openId !== nodeId) {
    return (
      <div
        aria-busy="true"
        className="flex h-full items-center justify-center text-sm text-ink-muted"
      >
        Opening graph…
      </div>
    )
  }
  return (
    <div className="flex h-full min-h-0 max-md:flex-col">
      <div className="relative min-h-0 min-w-0 flex-1">
        <ProgramCanvas extras={extras} />
        <div className="pointer-events-none absolute bottom-3 left-1/2 flex w-full max-w-lg -translate-x-1/2 flex-col gap-1 px-3">
          {saveError && (
            <Alert variant="error" className="bg-raised">
              <AlertDescription className="text-xs">
                {saveError}
              </AlertDescription>
            </Alert>
          )}
          {verdict?.status === 'refused' && (
            <Alert variant="error" className="bg-raised">
              <AlertDescription className="text-xs break-words">
                {verdict.message}
              </AlertDescription>
            </Alert>
          )}
        </div>
      </div>
      {program.nodes.length > 0 && <SidePanel />}
    </div>
  )
}

function SidePanel() {
  const selected = useProgramDoc((doc) => doc.selected)
  const [tab, setTab] = useState<string>('run')
  const [shownSelection, setShownSelection] = useState(selected)
  if (selected !== shownSelection) {
    setShownSelection(selected)
    if (selected) setTab('node')
  }
  return (
    <SidebarProvider className="min-h-0 w-96 shrink-0 max-md:h-1/2 max-md:w-full">
      <Sidebar
        side="right"
        collapsible="none"
        className="w-full border-l border-separator bg-artifact max-md:border-t max-md:border-l-0"
      >
        <Tabs
          value={tab}
          onValueChange={(next) => setTab(String(next))}
          className="min-h-0 flex-1 gap-0"
        >
          <SidebarHeader className="border-b border-separator p-0 px-1.5">
            <TabsList variant="underline" className="w-full">
              <TabsTab value="node">Node</TabsTab>
              <TabsTab value="run">Run</TabsTab>
              <TabsTab value="compute">Compute</TabsTab>
              <TabsTab value="life">Life</TabsTab>
            </TabsList>
          </SidebarHeader>
          <TabsPanel value="node" className="flex min-h-0 flex-1 flex-col">
            <SidebarContent className="gap-0">
              <NodeInspector />
            </SidebarContent>
          </TabsPanel>
          <TabsPanel value="run" className="flex min-h-0 flex-1 flex-col">
            <SidebarContent className="gap-0">
              <RunRail />
            </SidebarContent>
          </TabsPanel>
          <TabsPanel value="compute" className="flex min-h-0 flex-1 flex-col">
            <SidebarContent className="gap-0">
              <ComputePanel />
            </SidebarContent>
          </TabsPanel>
          <TabsPanel value="life" className="flex min-h-0 flex-1 flex-col">
            <SidebarContent className="gap-0">
              <LifePanel />
            </SidebarContent>
          </TabsPanel>
        </Tabs>
      </Sidebar>
    </SidebarProvider>
  )
}

export function ProgramSurface() {
  const nodeId = useSearch({ strict: false }).program
  return nodeId ? <OpenProgram key={nodeId} nodeId={nodeId} /> : <GraphsHome />
}
