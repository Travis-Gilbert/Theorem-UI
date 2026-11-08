// SOURCING: Codex CLI rollout logs (~/.codex/sessions/YYYY/MM/DD/rollout-<time>-<id>.jsonl), lines {timestamp, type, payload}. Undocumented and versioned by Codex; not checked against a log on this machine (none here). session_meta (id, cwd); event_msg user_message / agent_message / agent_reasoning / task_started / task_complete / turn_aborted; response_item function_call / function_call_output / custom_tool_call / custom_tool_call_output / local_shell_call. response_item message and reasoning lines repeat what event_msg already carries, plus injected context, so they are skipped.
import {
  assistantTurn,
  formatInput,
  oversizedNote,
  stepFor,
  stepTitle,
  userTurn,
  type Transcript,
} from './transcript'
import { decodeFragment } from './claude-log'

type Json = Record<string, unknown>
const object = (value: unknown): Json =>
  value && typeof value === 'object' && !Array.isArray(value) ? (value as Json) : {}
const text = (value: unknown) => (typeof value === 'string' ? value : undefined)

const parseArguments = (value: unknown): unknown => {
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return value
  }
}

/** function_call_output.output is often JSON: {output, metadata: {exit_code}}. */
function outputOf(value: unknown): { result: string; isError: boolean } {
  const raw = typeof value === 'string' ? value : formatInput(value)
  const parsed = object(parseArguments(raw))
  if (typeof parsed.output === 'string') {
    const exit = Number(object(parsed.metadata).exit_code)
    return { result: parsed.output, isError: Number.isFinite(exit) && exit !== 0 }
  }
  return { result: raw, isError: false }
}

export function applyCodexLine(transcript: Transcript, line: string): boolean {
  let entry: Json
  try {
    entry = object(JSON.parse(line))
  } catch {
    return false
  }
  const at = text(entry.timestamp)
  const payload = object(entry.payload)
  const id = `${at ?? ''}-${transcript.turns.length}`

  if (entry.type === 'theorem-oversized') {
    const callId = text(entry.id)
    if (callId) {
      const step = stepFor(transcript, callId)
      step.result = oversizedNote(Number(entry.bytes) || 0)
      step.done = true
    } else {
      assistantTurn(transcript, id, at).blocks.push({ type: 'note', text: oversizedNote(Number(entry.bytes) || 0) })
    }
    return true
  }

  if (entry.type === 'session_meta') {
    transcript.sessionId ??= text(payload.id)
    transcript.cwd ??= text(payload.cwd)
    return true
  }

  if (entry.type === 'event_msg') {
    switch (payload.type) {
      case 'user_message': {
        const message = text(payload.message)?.trim()
        if (message) {
          userTurn(transcript, id, message, at)
          transcript.title ??= message.split('\n')[0]!.slice(0, 120)
          transcript.open = true
        }
        return true
      }
      case 'agent_message': {
        const message = text(payload.message)?.trim()
        if (message) assistantTurn(transcript, id, at).blocks.push({ type: 'text', text: message })
        return true
      }
      case 'agent_reasoning': {
        const value = text(payload.text)?.trim()
        if (value) assistantTurn(transcript, id, at).blocks.push({ type: 'reasoning', text: value })
        return true
      }
      case 'task_started':
        transcript.open = true
        return true
      case 'task_complete':
        transcript.open = false
        return true
      case 'turn_aborted': {
        const last = transcript.turns.at(-1)
        if (last?.role === 'assistant') last.stopped = true
        transcript.open = false
        return true
      }
      default:
        return true
    }
  }

  if (entry.type === 'response_item') {
    switch (payload.type) {
      case 'function_call':
      case 'custom_tool_call':
      case 'local_shell_call': {
        const name = text(payload.name) ?? (payload.type === 'local_shell_call' ? 'local_shell' : 'tool')
        const input =
          payload.type === 'function_call'
            ? parseArguments(payload.arguments)
            : payload.type === 'custom_tool_call'
              ? payload.input
              : object(payload.action)
        assistantTurn(transcript, id, at).blocks.push({
          type: 'step',
          step: {
            id: text(payload.call_id) ?? text(payload.id) ?? id,
            name,
            title: stepTitle(name, input),
            input: formatInput(input),
            done: false,
          },
        })
        return true
      }
      case 'function_call_output':
      case 'custom_tool_call_output': {
        const step = stepFor(transcript, text(payload.call_id) ?? id)
        const { result, isError } = outputOf(payload.output)
        step.result = result
        step.isError = isError
        step.done = true
        return true
      }
      default:
        return true
    }
  }
  return true
}

/** A title from the discovery listing's raw fragment of the first user_message line. */
export function codexTitleFragment(fragment: string): string | undefined {
  const match = fragment.match(/"message":"((?:[^"\\]|\\.)*)/)
  if (!match) return undefined
  const value = decodeFragment(match[1]!).trim()
  return value ? value.split('\n')[0]!.slice(0, 120) : undefined
}
