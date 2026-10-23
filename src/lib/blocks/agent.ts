// SOURCING: yaml and zod (an agent block's body and its schema, plan D9).
// Running it goes through runs.ts, which plan Phase 5 wires to harness runs.
import { parse as parseYaml } from 'yaml'
import { z } from 'zod'

export const agentSchema = z.strictObject({
  prompt: z.string().min(1),
  /** Other blocks (`#id`) and workspace paths the agent is given. */
  inputs: z.array(z.string()).default([]),
  /** `manual`, or `{ schedule: "<cron>" }`. */
  trigger: z
    .union([
      z.literal('manual'),
      z.strictObject({ schedule: z.string().min(1) }),
    ])
    .default('manual'),
  /** Where the run writes its result, relative to the workspace. */
  output: z.string().optional(),
})

export type AgentSpec = z.infer<typeof agentSchema>

export class AgentBlockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AgentBlockError'
  }
}

/** Parses an agent block's YAML body. */
export function parseAgent(body: string): AgentSpec {
  let data: unknown
  try {
    data = parseYaml(body)
  } catch (error) {
    throw new AgentBlockError(
      `The agent block is not valid YAML: ${(error as Error).message}`,
    )
  }
  const result = agentSchema.safeParse(data ?? {})
  if (!result.success)
    throw new AgentBlockError(
      result.error.issues
        .map((issue) => `${issue.path.join('.') || 'agent'}: ${issue.message}`)
        .join('; '),
    )
  return result.data
}

/** The blocks an agent reads, by name. */
export const agentInputs = (spec: AgentSpec): Array<string> =>
  spec.inputs
    .filter((input) => input.startsWith('#'))
    .map((input) => input.slice(1))

/** The workspace paths an agent reads. */
export const agentReads = (spec: AgentSpec): Array<string> =>
  spec.inputs.filter((input) => !input.startsWith('#'))
