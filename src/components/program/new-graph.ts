// SOURCING: @tanstack/react-query and @tanstack/react-router over Theorem's blank,
// gallery_fork and save actions; both start a graph with the same steps.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from '@tanstack/react-router'
import {
  blankProgram,
  forkStarter,
  listPrograms,
  programKeys,
  saveProgram,
} from '@/lib/program/api'
import type { ProgramDefinition } from '@/lib/program/contracts'
import { useProgramDoc } from '@/lib/program/store'

export const freeName = (base: string, taken: Set<string>) => {
  if (!taken.has(base)) return base
  let number = 2
  while (taken.has(`${base} ${number}`)) number += 1
  return `${base} ${number}`
}

type NewGraph = {
  /** Start from this template; a graph with no template starts blank. */
  starter?: ProgramDefinition
  /** Fill this blank draft instead of starting another. */
  replacing?: string
  /** Leave no history entry behind, for a graph nobody asked for by name. */
  replace?: boolean
}

export function useNewGraph() {
  const client = useQueryClient()
  const navigate = useNavigate()
  return useMutation({
    mutationFn: async ({ starter, replacing }: NewGraph) => {
      const existing = await client.ensureQueryData({
        queryKey: programKeys.list(),
        queryFn: listPrograms,
      })
      const taken = new Set(
        existing
          .filter((program) => program.node_id !== replacing)
          .map((program) => program.name),
      )
      const program = starter
        ? await forkStarter(
            starter.name,
            freeName(starter.name, taken),
            starter.intent,
          )
        : await blankProgram().then((blank) => ({
            ...blank,
            name: freeName(blank.name, taken),
          }))
      // A draft is named by its content, so each new graph needs content of its own.
      return saveProgram(
        {
          ...program,
          metadata: { ...program.metadata, created_at_ms: Date.now() },
        },
        {},
        replacing,
      )
    },
    onSuccess: (saved, { replacing, replace }) => {
      void client.invalidateQueries({ queryKey: programKeys.list() })
      if (replacing) {
        // The open graph gives way to its replacement, so nothing of it is saved over it.
        if (useProgramDoc.getState().nodeId === replacing)
          useProgramDoc.getState().close()
        void client.invalidateQueries({ queryKey: programKeys.load(replacing) })
        return
      }
      void navigate({
        to: '/canvas',
        search: { program: saved.node_id },
        replace,
      })
    },
  })
}
