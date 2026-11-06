// SOURCING: @theoremharness/sdk programs.startRun and programs.followRun (the durable
// run-event log and its SSE stream, adopted as-is). Liveness shown on the canvas is what
// these events said; nothing here simulates a node. The stream's settled frame shares
// the event stream's generated type, so it is told apart here by having no sequence.
import { TheoremError } from '@theoremharness/sdk'
import { describeError, mutate, theorem } from '@/lib/theorem/client'
import { NativeToolError } from '@/lib/theorem/native'
import { loadRunReceipt } from './api'
import type { ProgramAuthorization } from './api'
import { useProgramDoc } from './store'

type Settlement = {
  status?: string
  code?: string | null
  message?: string | null
}
type SettledFrame = { settlement?: Settlement | null }

const STREAM_TIMEOUT_SECONDS = 24 * 60 * 60
const UNSETTLED_STATUSES = new Set(['refused', 'failed', 'interrupted'])

let following: AbortController | undefined

export function stopFollowing() {
  following?.abort()
  following = undefined
}

async function followToEnd(runId: string, signal: AbortSignal) {
  const stream = await theorem().programs.followRun(
    { runId },
    { abortSignal: signal, timeoutInSeconds: STREAM_TIMEOUT_SECONDS },
  )
  let settlement: Settlement | undefined
  for await (const frame of stream) {
    if (typeof frame.sequence === 'number') {
      useProgramDoc.getState().runEvent(frame)
    } else {
      settlement = (frame as SettledFrame).settlement ?? undefined
    }
  }
  return settlement
}

/** The node that stopped a run says why better than the run's summary of it can. */
function stoppingEvent() {
  return useProgramDoc
    .getState()
    .run?.events.findLast(
      (event) =>
        (event.kind === 'node_error' || event.kind === 'node_refused') &&
        event.message,
    )
}

/** The events said how it went; the receipt holds what each node produced. */
async function settle(runId: string, settlement: Settlement | undefined) {
  const unsettled =
    settlement?.status && UNSETTLED_STATUSES.has(settlement.status)
  const stopped = unsettled ? stoppingEvent() : undefined
  const told = stopped
    ? `${stopped.node_id}: ${stopped.message}`
    : (settlement?.message ?? settlement?.code ?? undefined)
  const failure = unsettled ? told : undefined
  try {
    const receipt = await loadRunReceipt(runId)
    useProgramDoc.getState().report(receipt)
    useProgramDoc.getState().runSettled(failure, stopped?.node_id)
  } catch (error) {
    // A run refused before it started leaves a settlement and no receipt.
    useProgramDoc
      .getState()
      .runSettled(
        failure ??
          (error instanceof NativeToolError &&
          error.code === 'program_run_not_found'
            ? undefined
            : describeError(error)),
      )
  }
}

/** The node a validation refusal names, when it names one. */
function refusedNode(error: unknown) {
  if (!(error instanceof TheoremError)) return undefined
  const { data } = (error.body ?? {}) as { data?: { node_ids?: Array<string> } }
  return data?.node_ids?.[0]
}

/** Start a run in Theorem and follow its events until it settles. */
export async function startProgramRun(
  options: Record<string, unknown>,
  authorization: ProgramAuthorization = {},
) {
  stopFollowing()
  const controller = new AbortController()
  following = controller
  const doc = useProgramDoc.getState()
  if (!doc.program) return
  const program = doc.program
  doc.beginRun()
  try {
    const started = await mutate((headers) =>
      theorem().programs.startRun(
        {
          ...headers,
          program: program,
          ...authorization,
          options: { invocation_id: crypto.randomUUID(), ...options },
        },
        { abortSignal: controller.signal },
      ),
    )
    useProgramDoc.getState().runStarted(started.run_id)
    await settle(
      started.run_id,
      await followToEnd(started.run_id, controller.signal),
    )
  } catch (error) {
    if (!controller.signal.aborted) {
      const named = refusedNode(error)
      useProgramDoc.getState().runSettled(describeError(error), named)
      // Theorem named what to fix, so the panel opens on it.
      if (named) useProgramDoc.getState().select(named)
    }
  }
}

/**
 * An answer continues the run that asked, under the same run id, and is followed the same
 * way. A refused answer throws with the question still on screen.
 */
export async function answerParkedRun(
  resumeToken: string,
  options: Record<string, unknown>,
) {
  stopFollowing()
  const controller = new AbortController()
  following = controller
  const { program } = useProgramDoc.getState()
  if (!program) return
  const started = await mutate((headers) =>
    theorem().programs.startRun(
      {
        ...headers,
        program,
        resume_token: resumeToken,
        options: { invocation_id: crypto.randomUUID(), ...options },
      },
      { abortSignal: controller.signal },
    ),
  )
  useProgramDoc.getState().beginRun(started.run_id)
  try {
    await settle(
      started.run_id,
      await followToEnd(started.run_id, controller.signal),
    )
  } catch (error) {
    if (!controller.signal.aborted) {
      await settle(started.run_id, {
        status: 'failed',
        message: describeError(error),
      })
    }
  }
}

/** Reopening a program picks its last run back up, from a finished receipt or mid-flight. */
export async function reattachProgramRun(runId: string) {
  stopFollowing()
  const controller = new AbortController()
  following = controller
  useProgramDoc.getState().beginRun(runId)
  try {
    await settle(runId, await followToEnd(runId, controller.signal))
  } catch {
    // The run this pointer names is gone (a reset graph); there is nothing to show.
    if (!controller.signal.aborted) useProgramDoc.getState().forgetRun()
  }
}
