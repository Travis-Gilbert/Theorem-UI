// SOURCING: assistant-ui's ThreadMessage parts as the runtime holds them, data parts named per @theoremharness/sdk/assistant-ui (`theorem-user_input`), and the chat's readApproval; code is terminal-code's (@tanstack/highlight); the snapshot shape is the terminal crate's Snapshot (terminal/src/lib.rs)
//
// The terminal's transcript as plain data: what the WASM terminal draws from
// a session's thread and what the session sent while a run worked. Pure, so
// the delivery states are tested without a runtime or a terminal.
import type { ThreadMessage } from '@assistant-ui/react'
import {
  highlightLines,
  openOf,
  proseAndCode,
  toolOutput,
} from './terminal-code'
import type { CodePart, Open, Output, ProsePart, Token } from './terminal-code'
import { readApproval } from '@/components/chat/theorem-parts'
import { describeError } from '@/lib/theorem/client'

export type Approval = {
  runId: string
  approvalId: string
  toolCallId: string
  allow?: string
  deny?: string
}

/**
 * What the person sent while a run worked, as this page knows it. `sending`
 * has no answer yet (or waits for the run's id); `sent` was accepted, and its
 * part in the transcript carries the delivery state from then on; `next`
 * reached a run that takes no more input, so it goes as the next turn;
 * `resent` went as that turn; `failed` was refused for another reason.
 */
export type Outgoing = {
  id: string
  text: string
  state: 'sending' | 'sent' | 'next' | 'resent' | 'failed'
  inputId?: string
  error?: string
}

type TerminalPart =
  | { type: 'text' | 'reasoning'; text: string }
  | CodePart
  | {
      type: 'tool'
      name: string
      summary: string
      status: string
      output?: Output
      /** The file it worked on, which a click opens in the editor. */
      open?: Open
    }
  | { type: 'program'; lines: Token[][]; streaming: boolean }
  | { type: 'input'; text: string; status: string; reason?: string }

/** A `user_input` part's fields; history drops type and partId, a stream keeps them. */
export function readInput(data: unknown) {
  const part = (data && typeof data === 'object' ? data : {}) as Record<
    string,
    unknown
  >
  const str = (value: unknown) =>
    typeof value === 'string' ? value : undefined
  const text = str(part.text)
  return text === undefined
    ? undefined
    : {
        inputId: str(part.inputId),
        text,
        status: str(part.status) ?? 'queued',
        reason: str(part.reason),
      }
}

/**
 * An answer's prose and highlighted code, kept per part: a streaming part is
 * a new object at each update, a settled one is lifted once.
 */
const lifted = new WeakMap<object, (ProsePart | CodePart)[]>()
function answerParts(part: { text: string }) {
  let parts = lifted.get(part)
  if (!parts) {
    parts = proseAndCode(part.text)
    lifted.set(part, parts)
  }
  return parts
}

const record = (data: unknown) =>
  (data && typeof data === 'object' ? data : {}) as Record<string, unknown>
const str = (value: unknown) => (typeof value === 'string' ? value : undefined)

/** A native program, highlighted once per part object like an answer. */
const programs = new WeakMap<object, Token[][]>()
function programLines(part: object, source: string, language?: string) {
  let lines = programs.get(part)
  if (!lines) {
    // A program names the language it runs in (TypeScript on Boa, Rust, ...).
    // Without one it is Monty, the Python subset the native agent writes.
    const lang = !language || language === 'monty' ? 'python' : language
    lines = highlightLines(source, lang)
    programs.set(part, lines)
  }
  return lines
}

/** A tool's path argument, which names the language of what it read. */
function pathOf(args: Record<string, unknown>) {
  return str(args.path) ?? str(args.file_path) ?? str(args.file)
}

/** A tool call's one-line summary: its first string argument, else the raw args. */
function toolSummary(args: Record<string, unknown>, argsText: string) {
  const first = Object.values(args).find((v) => typeof v === 'string')
  return (typeof first === 'string' ? first : argsText).replace(/\s+/g, ' ')
}

/**
 * The thread as the terminal draws it, plus the run's pending approval.
 * `references` names what the next turn carries, shown over the prompt.
 */
export function snapshotOf(
  messages: readonly ThreadMessage[],
  running: boolean,
  project: string,
  outbox: readonly Outgoing[],
  references: readonly string[] = [],
) {
  const ours = new Map(
    outbox.flatMap((o) => (o.inputId ? [[o.inputId, o] as const] : [])),
  )
  const shown = new Set<string>()
  let approval: Approval | undefined
  let pending: { tool: string; summary: string } | undefined
  /** What the run says it is doing, from its latest progress part. */
  let activity: string | undefined
  const last = messages.at(-1)
  const status = last?.role === 'assistant' ? last.status : undefined
  const error =
    status?.type === 'incomplete' && status.reason === 'error'
      ? describeError(status.error)
      : undefined

  const rows = messages.map((message) => {
    const runId = (
      message.metadata.custom as { theoremRunId?: string } | undefined
    )?.theoremRunId
    const content: readonly ThreadMessage['content'][number][] = message.content
    const parts = content.flatMap((part): TerminalPart[] => {
      if (part.type === 'text' && message.role === 'assistant')
        return answerParts(part)
      if (part.type === 'text' || part.type === 'reasoning')
        return [{ type: part.type, text: part.text }]
      if (part.type === 'data' && part.name === 'theorem-user_input') {
        const input = readInput(part.data)
        if (!input) return []
        if (input.inputId) shown.add(input.inputId)
        const outgoing = input.inputId ? ours.get(input.inputId) : undefined
        // This page sends what never arrived as the next turn.
        const drawn =
          input.status === 'not_delivered' && outgoing
            ? outgoing.state === 'resent'
              ? 'resent'
              : 'next'
            : input.status
        return [
          {
            type: 'input',
            text: input.text,
            status: drawn,
            reason: input.reason,
          },
        ]
      }
      if (part.type === 'data' && part.name === 'theorem-program') {
        const program = record(part.data)
        const source = str(program.source)
        if (!source) return []
        return [
          {
            type: 'program',
            lines: programLines(part, source, str(program.language)),
            streaming:
              program.streaming === true && message === last && running,
          },
        ]
      }
      if (part.type === 'data' && part.name === 'theorem-host_call') {
        const call = record(part.data)
        const state = str(call.state) ?? 'pending'
        const live = message === last && running
        return [
          {
            type: 'tool',
            name: str(call.name) ?? 'host call',
            summary:
              state === 'pending' && !live
                ? 'did not finish'
                : (str(call.effect) ?? ''),
            status:
              state === 'pending'
                ? live
                  ? 'running'
                  : 'error'
                : state === 'failed'
                  ? 'error'
                  : 'complete',
          },
        ]
      }
      if (
        part.type === 'data' &&
        part.name === 'theorem-progress' &&
        message === last &&
        running
      ) {
        activity = str(record(part.data).label) ?? activity
        return []
      }
      if (part.type !== 'tool-call') return []
      const asked = readApproval(part.interrupt)
      const waiting =
        asked !== undefined &&
        asked.approved === undefined &&
        part.result === undefined
      if (waiting && runId && !approval) {
        const kind = (k: string) =>
          asked.options.find((o) => o.kind === k)?.optionId
        approval = {
          runId,
          approvalId: asked.approvalId,
          toolCallId: asked.toolCallId,
          allow: kind('allow_once'),
          deny: kind('reject_once') ?? kind('reject_always'),
        }
        pending = { tool: asked.toolName, summary: asked.summary }
      }
      return [
        {
          type: 'tool',
          name: part.toolName,
          summary: toolSummary(part.args, part.argsText),
          status: waiting
            ? 'approval'
            : part.result !== undefined
              ? part.isError
                ? 'error'
                : 'complete'
              : message === last && running
                ? 'running'
                : 'complete',
          output: toolOutput(part.result, pathOf(part.args)),
          open: openOf(pathOf(part.args), part.args, part.result),
        },
      ]
    })
    return { role: message.role, parts }
  })
  // Sent from here and not in the transcript yet: answered, waiting or refused.
  const outgoing = outbox.flatMap((o) =>
    o.state === 'resent' || (o.inputId && shown.has(o.inputId))
      ? []
      : [
          {
            text: o.text,
            status: o.state === 'sent' ? 'queued' : o.state,
            reason: o.error,
          },
        ],
  )

  return {
    approval,
    json: JSON.stringify({
      running,
      project,
      error,
      approval: pending,
      activity,
      messages: rows,
      outgoing,
      references,
    }),
  }
}

/**
 * What a session sent that the finished run never took, oldest first: input
 * it refused, input it left undelivered, and input sent before its id was
 * known. `busy` holds input with a request still in flight, which waits for
 * its answer.
 */
export function leftoversOf(
  messages: readonly ThreadMessage[],
  outbox: readonly Outgoing[],
  busy: ReadonlySet<string>,
): Outgoing[] {
  const undelivered = new Set(
    messages.flatMap((message) => {
      const content: readonly ThreadMessage['content'][number][] =
        message.content
      return content.flatMap((part) => {
        if (part.type !== 'data' || part.name !== 'theorem-user_input')
          return []
        const input = readInput(part.data)
        return input?.inputId && input.status === 'not_delivered'
          ? [input.inputId]
          : []
      })
    }),
  )
  return outbox.filter(
    (o) =>
      !busy.has(o.id) &&
      (o.state === 'next' ||
        o.state === 'sending' ||
        (o.state === 'sent' && !!o.inputId && undelivered.has(o.inputId))),
  )
}
