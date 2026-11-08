// SOURCING: @assistant-ui/react-native ThreadMessageLike (text, reasoning and tool-call parts) as useExternalStoreRuntime takes them
//
// What either agent's log parses into. One assistant turn holds everything
// between two of the person's messages: the agent's text, its reasoning
// summaries when the log has them, and each tool call as a step.
import type { ThreadMessageLike } from '@assistant-ui/react-native'

export type Step = {
  id: string
  name: string
  /** One line saying what the step did, in the agent's own terms where it gave them. */
  title: string
  input?: string
  result?: string
  isError?: boolean
  done: boolean
}

export type Block =
  | { type: 'text'; text: string }
  | { type: 'reasoning'; text: string }
  | { type: 'step'; step: Step }
  | { type: 'note'; text: string }

export type Turn = {
  id: string
  role: 'user' | 'assistant'
  blocks: Block[]
  at?: string
  /** Set when the person stopped the turn. */
  stopped?: boolean
}

export type Transcript = {
  turns: Turn[]
  /** The log says a turn is still going. Only trusted while a live pane runs the agent. */
  open: boolean
  title?: string
  cwd?: string
  sessionId?: string
}

export const emptyTranscript = (): Transcript => ({ turns: [], open: false })

const json = (value: unknown) => {
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

export const formatInput = (value: unknown) => (typeof value === 'string' ? value : json(value))

const basename = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path
const oneLine = (text: string, max = 90) => {
  const line = text.replace(/\s+/g, ' ').trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

type Args = Record<string, unknown>
const str = (args: Args, key: string) => (typeof args[key] === 'string' ? (args[key] as string) : undefined)

/** A one-line title for a tool call, from the arguments the agent gave it. */
export function stepTitle(name: string, input: unknown): string {
  const args: Args = input && typeof input === 'object' ? (input as Args) : {}
  const file = str(args, 'file_path') ?? str(args, 'path') ?? str(args, 'notebook_path')
  switch (name) {
    case 'Bash':
      return oneLine(str(args, 'description') ?? `Ran ${str(args, 'command') ?? 'a command'}`)
    case 'Read':
      return file ? `Read ${basename(file)}` : 'Read a file'
    case 'Edit':
    case 'MultiEdit':
    case 'NotebookEdit':
      return file ? `Edited ${basename(file)}` : 'Edited a file'
    case 'Write':
      return file ? `Wrote ${basename(file)}` : 'Wrote a file'
    case 'Grep':
      return `Searched for ${oneLine(str(args, 'pattern') ?? 'text', 60)}`
    case 'Glob':
      return `Listed ${oneLine(str(args, 'pattern') ?? 'files', 60)}`
    case 'WebFetch': {
      const url = str(args, 'url')
      try {
        return url ? `Fetched ${new URL(url).host}` : 'Fetched a page'
      } catch {
        return 'Fetched a page'
      }
    }
    case 'WebSearch':
      return `Searched the web for ${oneLine(str(args, 'query') ?? '', 60)}`
    case 'Task':
    case 'Agent':
      return oneLine(str(args, 'description') ?? 'Ran a subagent')
    case 'TodoWrite':
    case 'update_plan':
      return 'Updated the plan'
    case 'shell':
    case 'exec_command':
    case 'local_shell': {
      const command = args.command ?? args.cmd
      const words = Array.isArray(command) ? command.map(String) : typeof command === 'string' ? [command] : []
      // Codex wraps commands as ["bash", "-lc", "<script>"].
      const shown = words.length === 3 && /(^|\/)(ba|z)?sh$/.test(words[0]!) && words[1] === '-lc' ? words[2]! : words.join(' ')
      return shown ? `Ran ${oneLine(shown, 80)}` : 'Ran a command'
    }
    case 'apply_patch': {
      const patch = typeof input === 'string' ? input : (str(args, 'input') ?? '')
      const files = [...patch.matchAll(/^\*\*\* (?:Update|Add|Delete) File: (.+)$/gm)].map((m) => basename(m[1]!))
      return files.length ? `Edited ${files.slice(0, 3).join(', ')}${files.length > 3 ? '…' : ''}` : 'Edited files'
    }
    default:
      return name.replace(/^mcp__/, '').replace(/__/g, ' · ').replace(/_/g, ' ')
  }
}

/** Finds the step a result belongs to, or adds a placeholder when the call itself was too large to keep. */
export function stepFor(transcript: Transcript, id: string): Step {
  for (let t = transcript.turns.length - 1; t >= 0; t--) {
    for (const block of transcript.turns[t]!.blocks)
      if (block.type === 'step' && block.step.id === id) return block.step
  }
  const step: Step = { id, name: 'step', title: 'A step too large to show here', done: false }
  assistantTurn(transcript, id).blocks.push({ type: 'step', step })
  return step
}

/** The open assistant turn, started if the last turn is the person's. */
export function assistantTurn(transcript: Transcript, id: string, at?: string): Turn {
  const last = transcript.turns.at(-1)
  if (last?.role === 'assistant') return last
  const turn: Turn = { id: `a-${id}`, role: 'assistant', blocks: [], at }
  transcript.turns.push(turn)
  return turn
}

export function userTurn(transcript: Transcript, id: string, text: string, at?: string) {
  transcript.turns.push({ id: `u-${id}`, role: 'user', blocks: [{ type: 'text', text }], at })
}

export const oversizedNote = (bytes: number) =>
  `Too large to show here (${Math.max(1, Math.round(bytes / 1024))} KB). It is in the log on the computer.`

/** The transcript as assistant-ui messages. `working` marks the last assistant turn as running. */
export function toMessages(transcript: Transcript, working: boolean): ThreadMessageLike[] {
  const last = transcript.turns.at(-1)
  return transcript.turns.map((turn): ThreadMessageLike => {
    if (turn.role === 'user')
      return {
        id: turn.id,
        role: 'user',
        content: turn.blocks.flatMap((block) => (block.type === 'text' ? [{ type: 'text' as const, text: block.text }] : [])),
        createdAt: turn.at ? new Date(turn.at) : undefined,
      }
    const running = working && turn === last
    return {
      id: turn.id,
      role: 'assistant',
      createdAt: turn.at ? new Date(turn.at) : undefined,
      status: running
        ? { type: 'running' }
        : turn.stopped
          ? { type: 'incomplete', reason: 'cancelled' }
          : { type: 'complete', reason: 'stop' },
      content: turn.blocks.map((block) => {
        switch (block.type) {
          case 'text':
            return { type: 'text' as const, text: block.text }
          case 'note':
            return { type: 'text' as const, text: block.text }
          case 'reasoning':
            return { type: 'reasoning' as const, text: block.text }
          case 'step':
            return {
              type: 'tool-call' as const,
              toolCallId: block.step.id,
              toolName: block.step.name,
              argsText: block.step.input ?? '',
              result: block.step.done ? (block.step.result ?? '') : undefined,
              isError: block.step.isError,
              artifact: { theoremStep: { title: block.step.title } },
            }
        }
      }),
    }
  })
}
