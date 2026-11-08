// SOURCING: the line format discoveryScript prints (./shell); tmux pane ids and pane_current_path; ps pid/ppid/args; the argv0 shapes Claude Code (native installer: ~/.local/share/claude/versions/<v>; npm: node …/@anthropic-ai/claude-code/cli.js) and Codex (codex, or node …/@openai/codex/bin/codex.js launching codex-<target>) run as
//
// Which agent conversations a computer has, and which of them a live tmux pane
// is running. A conversation is talkable only when exactly one pane runs that
// agent in that folder: two would make it a guess which one is writing the log.
import { claudeTitleFragment, decodeFragment } from './claude-log'
import { codexTitleFragment } from './codex-log'
import { afterMark, type Agent } from './shell'

export type Pane = {
  id: string
  session: string
  pid: number
  path: string
  agent?: Agent
  /** The agent's own process: a send checks it still holds the pane's terminal. */
  agentPid?: number
}

export type Discovery = {
  tmux: boolean
  panes: Pane[]
  logs: LogEntry[]
  /** From liveScript: later logs of the same agent and folder. */
  newer: string[]
}

export type LogEntry = {
  agent: Agent
  path: string
  /** Seconds since the epoch. */
  mtime: number
  size: number
  cwd?: string
  title?: string
}

export type Liveness =
  | { kind: 'live'; pane: Pane }
  | { kind: 'ambiguous'; panes: Pane[] }
  | { kind: 'ended' }

export type AgentConversation = LogEntry & { computerId: string; liveness: Liveness }

const basename = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

/** The agent a process is, from its arguments; undefined for anything else. */
export function agentOf(args: string): Agent | undefined {
  const words = args.trim().split(/\s+/)
  const program = words[0] ?? ''
  const name = basename(program)
  if (name === 'claude' || /\/claude\/versions\/[^/]+$/.test(program)) return 'claude'
  if (name === 'codex' || /^codex-[a-z0-9_]+-/.test(name)) return 'codex'
  if (/^(node|bun|deno)$/.test(name)) {
    if (words.some((word) => word.includes('@anthropic-ai/claude-code'))) return 'claude'
    if (words.some((word) => word.includes('@openai/codex'))) return 'codex'
  }
  return undefined
}

/** The folder in a `"cwd":"…"` fragment that grep cut from a log line. */
export function cwdOfFragment(fragment: string): string | undefined {
  const match = fragment.match(/^"cwd":"((?:[^"\\]|\\.)*)"$/)
  return match ? decodeFragment(match[1]!) : undefined
}

/** Parses discoveryScript output. Returns undefined when the script's marker never arrived. */
export function parseDiscovery(stdout: string): Discovery | undefined {
  const lines = afterMark(stdout)
  if (!lines) return undefined
  let tmux = true
  const panes: Pane[] = []
  const parents = new Map<number, number>()
  const args = new Map<number, string>()
  const logs = new Map<string, LogEntry>()
  const newer: string[] = []
  for (const line of lines) {
    const fields = line.split('\t')
    switch (fields[0]) {
      case 'tmux':
        tmux = false
        break
      case 'pane': {
        const [, id, session, pid, ...path] = fields
        if (id && session !== undefined && pid) panes.push({ id, session, pid: Number(pid), path: path.join('\t') })
        break
      }
      case 'proc':
        parents.set(Number(fields[1]), Number(fields[2]))
        break
      case 'args':
        args.set(Number(fields[1]), fields.slice(2).join('\t'))
        break
      case 'newer':
        newer.push(fields.slice(1).join('\t'))
        break
      case 'log': {
        const [, agent, mtime, size, ...path] = fields
        if (agent !== 'claude' && agent !== 'codex') break
        const file = path.join('\t')
        logs.set(file, { agent, path: file, mtime: Number(mtime) || 0, size: Number(size) || 0 })
        break
      }
      case 'cwd': {
        const entry = logs.get(fields[1] ?? '')
        const cwd = cwdOfFragment(fields.slice(2).join('\t'))
        if (entry && cwd !== undefined) entry.cwd = cwd
        break
      }
      case 'title': {
        const entry = logs.get(fields[1] ?? '')
        const fragment = fields.slice(2).join('\t')
        if (entry && fragment)
          entry.title = entry.agent === 'claude' ? claudeTitleFragment(fragment) : codexTitleFragment(fragment)
        break
      }
    }
  }

  // Each pane's agent: its own process or a descendant (a shell started it).
  const children = new Map<number, number[]>()
  for (const [pid, ppid] of parents) children.set(ppid, [...(children.get(ppid) ?? []), pid])
  for (const pane of panes) {
    const queue = [pane.pid]
    for (let depth = 0; queue.length && depth < 64; depth++) {
      const pid = queue.shift()!
      const agent = args.has(pid) ? agentOf(args.get(pid)!) : undefined
      if (agent) {
        pane.agent = agent
        pane.agentPid = pid
        break
      }
      queue.push(...(children.get(pid) ?? []))
    }
  }
  return { tmux, panes, logs: [...logs.values()].sort((a, b) => b.mtime - a.mtime), newer }
}

const samePath = (a: string | undefined, b: string | undefined) =>
  !!a && !!b && a.replace(/\/+$/, '') === b.replace(/\/+$/, '')

/**
 * Pairs logs with the panes writing them. A pane writes the newest log of its
 * agent in its folder; older logs in the same folder are ended conversations.
 */
export function conversationsOf(computerId: string, discovery: Discovery): AgentConversation[] {
  const claimed = new Set<string>()
  const liveness = new Map<string, Liveness>()
  const agentPanes = discovery.panes.filter((pane) => pane.agent)
  for (const log of discovery.logs) {
    const key = `${log.agent}\t${log.cwd}`
    if (claimed.has(key)) continue
    claimed.add(key)
    const panes = agentPanes.filter((pane) => pane.agent === log.agent && samePath(pane.path, log.cwd))
    if (panes.length === 1) liveness.set(log.path, { kind: 'live', pane: panes[0]! })
    else if (panes.length > 1) liveness.set(log.path, { kind: 'ambiguous', panes })
  }
  return discovery.logs.map((log) => ({
    ...log,
    computerId,
    liveness: liveness.get(log.path) ?? { kind: 'ended' },
  }))
}

/**
 * Whether one conversation can be typed into now, from liveScript output: a
 * newer log in its folder has ended it; otherwise the one pane running its
 * agent there is writing it.
 */
export function livenessOf(discovery: Discovery, agent: Agent, cwd: string | undefined): Liveness {
  if (discovery.newer.length) return { kind: 'ended' }
  const panes = discovery.panes.filter((pane) => pane.agent === agent && samePath(pane.path, cwd))
  if (panes.length === 1) return { kind: 'live', pane: panes[0]! }
  if (panes.length > 1) return { kind: 'ambiguous', panes }
  return { kind: 'ended' }
}

/** A short folder name for a conversation row. */
export const folderName = (cwd: string | undefined) => (cwd ? basename(cwd) : undefined)
