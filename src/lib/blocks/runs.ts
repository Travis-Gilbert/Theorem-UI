// SOURCING: hand-rolled seam. Agent runs belong to plan Phase 5, which has no
// code yet; this records what was asked for and says so, and Phase 5 replaces
// the requester with one that queues the run.
import type { RunRequestResult } from './sandbox/protocol'

/** One request to run an agent block. */
export interface AgentRunRequest {
  /** `agent:#id`. */
  target: string
  /** The document holding the agent block. */
  documentPath: string
  /** Who asked: the Run button, or the block `#id` whose code called run(). */
  requestedBy: string
  requestedAt: string
}

export type RunRequester = (request: AgentRunRequest) => Promise<RunRequestResult>

const requests: Array<AgentRunRequest> = []

const notWired: RunRequester = async (request) => {
  requests.push(request)
  return {
    status: 'not-wired',
    target: request.target,
    message: `Recorded the request to run ${request.target}. Agent runs are not wired yet (plan Phase 5), so nothing ran.`,
  }
}

let requester: RunRequester = notWired

/** Asks for an agent run. */
export const requestAgentRun: RunRequester = (request) => requester(request)

/** The requests recorded while runs are not wired, oldest first. */
export const recordedAgentRuns = (): ReadonlyArray<AgentRunRequest> => requests

/** Phase 5 installs the real requester here. Returns a function that restores the previous one. */
export function setRunRequester(next: RunRequester): () => void {
  const previous = requester
  requester = next
  return () => {
    requester = previous
  }
}
