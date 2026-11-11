// SOURCING: @xyflow/react Panel, coss ui Group, Popover and Tooltip. Names the open
// program and its lineage, and holds the canvas commands that are not about a selection. A blank canvas offers the
// palette and the templates in place, since it is a place to start, not an error.
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import { Panel, useReactFlow, useStoreApi } from '@xyflow/react'
import { Field, FieldDescription, FieldLabel } from '@/components/coss/field'
import { Group, GroupSeparator } from '@/components/coss/group'
import { Input } from '@/components/coss/input'
import {
  Popover,
  PopoverPopup,
  PopoverTrigger,
} from '@/components/coss/popover'
import { Textarea } from '@/components/coss/textarea'
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from '@/components/coss/tooltip'
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import {
  forkProgram,
  listPrograms,
  programKeys,
  programNames,
  saveProgram,
} from '@/lib/program/api'
import { useProgramDoc } from '@/lib/program/store'
import { freeName } from './new-graph'
import { AddNoteMenu } from './program-annotations'
import { usePalette } from './palette'
import { ToolError } from './section'
import { freeSpot } from '@/lib/free-spot'
import { StartPanel } from './start-panel'

const NOTE = { width: 240, height: 140 }

export function ProgramHeader() {
  const program = useProgramDoc((doc) => doc.program)!
  const addNote = useProgramDoc((doc) => doc.addNote)
  const setIdentity = useProgramDoc((doc) => doc.setIdentity)
  const nodeId = useProgramDoc((doc) => doc.nodeId)
  const openPalette = usePalette((palette) => palette.openAt)
  const flow = useReactFlow()
  const store = useStoreApi()
  const navigate = useNavigate()
  const client = useQueryClient()
  const fork = useMutation({
    mutationFn: async () => {
      const doc = useProgramDoc.getState()
      const existing = await client.ensureQueryData({
        queryKey: programKeys.list(),
        queryFn: listPrograms,
      })
      const copy = await forkProgram(
        program,
        freeName(
          `${program.name} fork`,
          new Set(existing.map((other) => other.name)),
        ),
        program.intent,
      )
      // The copy has run nothing yet: the run on screen belongs to the original.
      const { last_run_id: _original, ...layout } = doc.layout
      return saveProgram(copy, { ...layout, nodes: doc.positions })
    },
    onSuccess: (saved) => {
      void client.invalidateQueries({ queryKey: programKeys.list() })
      void navigate({ to: '/canvas', search: { program: saved.node_id } })
    },
  })
  const names = useQuery({
    enabled: Boolean(program.parent_program_id),
    queryKey: programKeys.names(),
    queryFn: programNames,
  })
  const lineage = names.data?.get(program.parent_program_id ?? '')
  const center = () => {
    const pane = store.getState().domNode?.getBoundingClientRect()
    const screen = pane
      ? { x: pane.left + pane.width / 2, y: pane.top + pane.height / 2 }
      : { x: window.innerWidth / 2, y: window.innerHeight / 2 }
    return { screen, anchor: flow.screenToFlowPosition(screen) }
  }
  const spot = (size = NOTE) =>
    freeSpot(
      center().anchor,
      flow.getNodes().map((node) => ({
        ...node.position,
        width: node.measured?.width ?? 248,
        height: node.measured?.height ?? 100,
      })),
      size,
    )
  return (
    <>
      <Panel position="bottom-center" className="flex flex-col gap-1">
        <ToolError error={fork.error} />
        <Group aria-label="Graph" className="bg-raised">
          <Input
            size="sm"
            aria-label="Graph name"
            placeholder="Name this graph"
            className="w-44 font-medium"
            value={program.name}
            onChange={(event) => setIdentity({ name: event.target.value })}
          />
          <GroupSeparator />
          <Popover>
            <Tooltip>
              <TooltipTrigger
                render={
                  <PopoverTrigger
                    render={
                      <Button
                        size="icon-sm"
                        variant="outline"
                        aria-label="About this graph"
                      />
                    }
                  />
                }
              >
                <Icon.Article className="size-4" />
              </TooltipTrigger>
              <TooltipPopup>About this graph</TooltipPopup>
            </Tooltip>
            <PopoverPopup side="top" align="start" className="w-72">
              <Field>
                <FieldLabel>What this graph is for</FieldLabel>
                <Textarea
                  size="sm"
                  placeholder="What is this graph for?"
                  value={program.intent}
                  onChange={(event) =>
                    setIdentity({ intent: event.target.value })
                  }
                />
                {lineage && (
                  <FieldDescription>Forked from {lineage}</FieldDescription>
                )}
              </Field>
            </PopoverPopup>
          </Popover>
          <GroupSeparator />
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              const { anchor, screen } = center()
              openPalette(anchor, screen)
            }}
          >
            <Icon.AddNode className="size-4" />
            Add node
          </Button>
          <GroupSeparator />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Add note"
                  onClick={() => addNote(spot())}
                />
              }
            >
              <Icon.Note className="size-4" />
            </TooltipTrigger>
            <TooltipPopup>Add note</TooltipPopup>
          </Tooltip>
          <GroupSeparator />
          <AddNoteMenu spot={spot} />
          <GroupSeparator />
          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon-sm"
                  variant="outline"
                  aria-label="Fork"
                  disabled={fork.isPending}
                  onClick={() => fork.mutate()}
                />
              }
            >
              <Icon.Fork className="size-4" />
            </TooltipTrigger>
            <TooltipPopup>Fork this graph</TooltipPopup>
          </Tooltip>
        </Group>
      </Panel>
      {program.nodes.length === 0 && (
        <StartPanel
          message="This canvas is blank."
          action="Add the first node"
          onAction={() => {
            const { anchor, screen } = center()
            openPalette(anchor, screen)
          }}
          replacing={nodeId}
        />
      )}
    </>
  )
}
