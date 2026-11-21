// SOURCING: bun:test, Bun.spawnSync running the generated scripts with /bin/sh -s (dash here, as strict as a POSIX sh gets) and a private tmux server (TMUX_TMPDIR); log lines shaped like a Claude Code 2.1 log and a Codex rollout
import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { applyClaudeLine, claudeTitleFragment, promptText } from './claude-log'
import { applyCodexLine } from './codex-log'
import { agentOf, conversationsOf, livenessOf, parseDiscovery } from './discovery'
import { LogFollower } from './log-reader'
import {
  afterMark,
  discoveryScript,
  findStartedLogScript,
  lineLengthScript,
  liveScript,
  readScript,
  sendScript,
  startScript,
} from './shell'
import { emptyTranscript, stepTitle, toMessages } from './transcript'

let root: string
let home: string
let bin: string

beforeAll(() => {
  root = mkdtempSync(join(tmpdir(), 'theorem-agents-'))
  home = join(root, 'home')
  bin = join(root, 'bin')
  mkdirSync(home, { recursive: true })
  mkdirSync(bin, { recursive: true })
})
afterAll(() => {
  Bun.spawnSync(['tmux', 'kill-server'], { env: { ...process.env, TMUX_TMPDIR: root } })
  rmSync(root, { recursive: true, force: true })
})

/** Runs a script the way the native module does: `/bin/sh -s` with the script on stdin. */
function sh(script: string, path = process.env.PATH ?? '/usr/bin:/bin'): string {
  const result = Bun.spawnSync([process.env.THEOREM_TEST_SH ?? '/bin/sh', '-s'], {
    stdin: Buffer.from(script),
    env: { HOME: home, PATH: path, TMUX_TMPDIR: root },
  })
  if (result.exitCode !== 0) throw new Error(`exit ${result.exitCode}: ${result.stderr.toString()}`)
  return result.stdout.toString()
}

const write = (path: string, text: string) => {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, text)
}

describe('readScript', () => {
  test('reads whole lines and holds back one still being written', () => {
    const file = join(root, 'partial.jsonl')
    write(file, '{"a":1}\n{"b":2}\n{"c":')
    const lines = afterMark(sh(readScript(file, 0)))!
    expect(lines).toEqual(['@@size 21', '@@from 0', '{"a":1}', '{"b":2}', '@@used 16'])
  })

  test('starts a tail read after the line it lands in', () => {
    const file = join(root, 'tail.jsonl')
    write(file, 'aaaaaaaaaa\nbbbbbbbbbb\ncccccccccc\n')
    const lines = afterMark(sh(readScript(file, -15)))!
    expect(lines).toEqual(['@@size 33', '@@from 18', 'cccccccccc', '@@used 15'])
  })

  test('a tail longer than the file reads all of it', () => {
    const file = join(root, 'short.jsonl')
    write(file, 'one\ntwo\n')
    expect(afterMark(sh(readScript(file, -1000)))).toEqual(['@@size 8', '@@from 0', 'one', 'two', '@@used 8'])
  })

  test('replaces an oversized line with a marker naming its tool call', () => {
    const file = join(root, 'big.jsonl')
    const big = JSON.stringify({ type: 'user', message: { content: [{ tool_use_id: 'toolu_1', content: 'x'.repeat(500) }] } })
    write(file, `{"a":1}\n${big}\n`)
    const lines = afterMark(sh(readScript(file, 0, { oversized: 100 })))!
    expect(JSON.parse(lines[3]!)).toEqual({ type: 'theorem-oversized', bytes: big.length, id: 'toolu_1' })
  })

  test('says when the log is gone', () => {
    expect(afterMark(sh(readScript(join(root, 'nope.jsonl'), 0)))).toEqual(['@@missing'])
  })

  test('survives a startup file that prints', () => {
    const out = sh(`echo welcome to the box\n${readScript(join(root, 'nope.jsonl'), 0)}`)
    expect(afterMark(out)).toEqual(['@@missing'])
  })

  test('lineLengthScript waits for the line to end', () => {
    const file = join(root, 'long.jsonl')
    write(file, 'x'.repeat(50))
    expect(afterMark(sh(lineLengthScript(file, 0)))).toEqual(['0'])
    write(file, `${'x'.repeat(50)}\nnext`)
    expect(afterMark(sh(lineLengthScript(file, 0)))).toEqual(['51'])
  })
})

const claudeLines = (cwd: string) => [
  { type: 'ai-title', aiTitle: 'Fix the flaky test', sessionId: 's1' },
  {
    parentUuid: null,
    isSidechain: false,
    cwd,
    sessionId: 's1',
    type: 'user',
    message: { role: 'user', content: '<system-reminder>context</system-reminder>Why does the test flake?' },
    uuid: 'u1',
    timestamp: '2026-11-08T10:00:00.000Z',
  },
  {
    isSidechain: false,
    type: 'assistant',
    message: { id: 'm1', role: 'assistant', content: [{ type: 'thinking', thinking: '', signature: 'sig' }], stop_reason: null },
    uuid: 'a1',
  },
  {
    isSidechain: false,
    type: 'assistant',
    message: {
      id: 'm1',
      role: 'assistant',
      content: [{ type: 'tool_use', id: 'toolu_1', name: 'Bash', input: { command: 'bun test', description: 'Run the tests' } }],
      stop_reason: 'tool_use',
    },
    uuid: 'a2',
  },
  { isSidechain: true, type: 'assistant', message: { id: 'side', content: [{ type: 'text', text: 'subagent noise' }] } },
  {
    isSidechain: false,
    type: 'user',
    message: { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'toolu_1', content: '1 fail', is_error: true }] },
    uuid: 'u2',
  },
  {
    isSidechain: false,
    type: 'assistant',
    message: { id: 'm2', role: 'assistant', content: [{ type: 'text', text: 'The timer is not awaited.' }], stop_reason: 'end_turn' },
    uuid: 'a3',
  },
]

describe('Claude Code logs', () => {
  test('builds turns, steps and the finished state', () => {
    const transcript = emptyTranscript()
    for (const line of claudeLines('/work/app')) applyClaudeLine(transcript, JSON.stringify(line))
    expect(transcript.title).toBe('Fix the flaky test')
    expect(transcript.cwd).toBe('/work/app')
    expect(transcript.open).toBe(false)
    expect(transcript.turns.map((turn) => turn.role)).toEqual(['user', 'assistant'])
    expect(transcript.turns[0]!.blocks).toEqual([{ type: 'text', text: 'Why does the test flake?' }])
    const [step, text] = transcript.turns[1]!.blocks
    expect(step).toMatchObject({ type: 'step', step: { title: 'Run the tests', result: '1 fail', isError: true, done: true } })
    expect(text).toEqual({ type: 'text', text: 'The timer is not awaited.' })
  })

  test('an interruption stops the turn', () => {
    const transcript = emptyTranscript()
    for (const line of claudeLines('/w').slice(0, 4)) applyClaudeLine(transcript, JSON.stringify(line))
    expect(transcript.open).toBe(true)
    applyClaudeLine(
      transcript,
      JSON.stringify({ type: 'user', message: { content: [{ type: 'text', text: '[Request interrupted by user for tool use]' }] } }),
    )
    expect(transcript.open).toBe(false)
    expect(transcript.turns.at(-1)!.stopped).toBe(true)
    const messages = toMessages(transcript, false)
    expect(messages.at(-1)!.status).toEqual({ type: 'incomplete', reason: 'cancelled' })
  })

  test('slash commands read as the command the person typed', () => {
    expect(promptText('<command-name>/review</command-name><command-args>main</command-args>')).toBe('/review main')
    expect(promptText('<local-command-stdout>done</local-command-stdout>')).toBeUndefined()
  })

  test('titles come from a fragment cut mid-escape', () => {
    expect(claudeTitleFragment('{"type":"ai-title","aiTitle":"Fix \\"it\\"","x":1}')).toBe('Fix "it"')
    expect(claudeTitleFragment('{"type":"user","message":{"role":"user","content":"Line one\\nline two \\u00')).toBe(
      'Line one',
    )
  })
})

describe('Codex rollouts', () => {
  test('builds turns from event messages and tool calls', () => {
    const lines = [
      { timestamp: 't0', type: 'session_meta', payload: { id: 'c1', cwd: '/work/api' } },
      { timestamp: 't1', type: 'event_msg', payload: { type: 'user_message', message: 'Add a health check' } },
      { timestamp: 't1', type: 'response_item', payload: { type: 'message', role: 'user', content: [] } },
      { timestamp: 't2', type: 'event_msg', payload: { type: 'agent_reasoning', text: 'Looking at the router' } },
      {
        timestamp: 't3',
        type: 'response_item',
        payload: { type: 'function_call', name: 'shell', arguments: '{"command":["bash","-lc","rg health"]}', call_id: 'call_1' },
      },
      {
        timestamp: 't4',
        type: 'response_item',
        payload: { type: 'function_call_output', call_id: 'call_1', output: '{"output":"","metadata":{"exit_code":1}}' },
      },
      { timestamp: 't5', type: 'event_msg', payload: { type: 'agent_message', message: 'There is none yet.' } },
      { timestamp: 't6', type: 'event_msg', payload: { type: 'task_complete' } },
    ]
    const transcript = emptyTranscript()
    for (const line of lines) applyCodexLine(transcript, JSON.stringify(line))
    expect(transcript.cwd).toBe('/work/api')
    expect(transcript.title).toBe('Add a health check')
    expect(transcript.open).toBe(false)
    const blocks = transcript.turns[1]!.blocks
    expect(blocks[0]).toEqual({ type: 'reasoning', text: 'Looking at the router' })
    expect(blocks[1]).toMatchObject({ type: 'step', step: { title: 'Ran rg health', isError: true, done: true } })
    expect(blocks[2]).toEqual({ type: 'text', text: 'There is none yet.' })
  })

  test('apply_patch titles name the files', () => {
    expect(stepTitle('apply_patch', '*** Begin Patch\n*** Update File: src/a.ts\n*** Add File: src/b.ts\n')).toBe(
      'Edited a.ts, b.ts',
    )
  })
})

describe('LogFollower', () => {
  const run = async (script: string) => sh(script)

  test('reads a log, then only what is appended', async () => {
    const file = join(home, '.claude/projects/-work-app/s1.jsonl')
    const lines = claudeLines('/work/app').map((line) => JSON.stringify(line))
    write(file, `${lines.slice(0, 4).join('\n')}\n`)
    const follower = new LogFollower('claude', file)
    expect(await follower.poll(run)).toEqual({ changed: true, caughtUp: true, missing: false })
    expect(follower.transcript.open).toBe(true)
    expect(follower.startedMidway).toBe(false)
    writeFileSync(file, `${lines.join('\n')}\n`)
    expect((await follower.poll(run)).changed).toBe(true)
    expect(follower.transcript.open).toBe(false)
    expect(follower.transcript.turns).toHaveLength(2)
    expect((await follower.poll(run)).changed).toBe(false)
  })

  test('starts near the end of a long log and reads it in pieces', async () => {
    const file = join(root, 'long-log.jsonl')
    const turns = Array.from({ length: 400 }, (_, i) =>
      JSON.stringify({ type: 'user', message: { content: `message ${i} ${'.'.repeat(80)}` }, uuid: `u${i}` }),
    )
    write(file, `${turns.join('\n')}\n`)
    const follower = new LogFollower('claude', file, 20_000)
    const result = await follower.poll(async (script) => sh(script.replace('lim=56000', 'lim=4000')))
    expect(result.caughtUp).toBe(true)
    expect(follower.startedMidway).toBe(true)
    const texts = follower.transcript.turns.map((turn) => (turn.blocks[0] as { text: string }).text)
    expect(texts.at(-1)).toStartWith('message 399')
    // No turn is cut or repeated across the pieces.
    const numbers = texts.map((text) => Number(text.split(' ')[1]))
    expect(numbers).toEqual(numbers.map((_, i) => numbers[0]! + i))
  })

  test('a long Codex log still names its folder when the read starts past session_meta', async () => {
    const file = join(root, 'long-codex.jsonl')
    const lines = [
      JSON.stringify({ timestamp: 't0', type: 'session_meta', payload: { id: 'c2', cwd: '/work/api' } }),
      ...Array.from({ length: 200 }, (_, i) =>
        JSON.stringify({ timestamp: `t${i + 1}`, type: 'event_msg', payload: { type: 'user_message', message: `turn ${i} ${'.'.repeat(60)}` } }),
      ),
    ]
    write(file, `${lines.join('\n')}\n`)
    const follower = new LogFollower('codex', file, 4_000)
    await follower.poll(run)
    expect(follower.startedMidway).toBe(true)
    expect(follower.transcript.cwd).toBe('/work/api')
  })

  test('steps over a line longer than a whole read', async () => {
    const file = join(root, 'huge-line.jsonl')
    write(file, `{"type":"user","message":{"content":"hi"}}\n{"type":"user","x":"${'y'.repeat(9000)}"}\n{"type":"user","message":{"content":"after"}}\n`)
    const follower = new LogFollower('claude', file)
    await follower.poll(async (script) => sh(script.replace('lim=56000', 'lim=3000')))
    const blocks = follower.transcript.turns.flatMap((turn) => turn.blocks)
    expect(blocks.map((block) => block.type)).toEqual(['text', 'note', 'text'])
  })
})

describe('discovery', () => {
  test('agentOf knows the shapes the agents run as', () => {
    expect(agentOf('claude --resume x')).toBe('claude')
    expect(agentOf('/Users/me/.local/share/claude/versions/2.1.319')).toBe('claude')
    expect(agentOf('node /opt/lib/node_modules/@anthropic-ai/claude-code/cli.js')).toBe('claude')
    expect(agentOf('/usr/local/bin/codex')).toBe('codex')
    expect(agentOf('/x/codex-aarch64-apple-darwin exec')).toBe('codex')
    expect(agentOf('node /x/@openai/codex/bin/codex.js')).toBe('codex')
    expect(agentOf('vim claude.md')).toBeUndefined()
  })

  test('pairs the newest log in a folder with the one pane running its agent there', () => {
    mkdirSync(join(home, '.codex/sessions'), { recursive: true })
    // Key order as Claude Code writes it: cwd before type, type before message.
    const older = join(home, '.claude/projects/-work-web/old.jsonl')
    const newest = join(home, '.claude/projects/-work-web/new.jsonl')
    write(older, `${JSON.stringify({ parentUuid: null, cwd: '/work/web', type: 'user', message: { role: 'user', content: 'old' } })}\n`)
    write(newest, `${JSON.stringify({ type: 'ai-title', aiTitle: 'Newest' })}\n${JSON.stringify({ cwd: '/work/web', type: 'user' })}\n`)
    utimesSync(older, new Date(Date.now() - 60_000), new Date(Date.now() - 60_000))
    write(
      join(bin, 'tmux'),
      `#!/bin/sh\nprintf 'pane\\t%%1\\tmain\\t100\\t/work/web\\npane\\t%%2\\tother\\t200\\t/work/api\\n'\n`,
    )
    write(
      join(bin, 'ps'),
      [
        '#!/bin/sh',
        'case "$*" in',
        '  *ppid*) printf "  100 1\\n  101 100\\n  200 1\\n" ;;',
        '  *) printf "  101 /home/me/.local/share/claude/versions/2.1.319\\n  999 grep claude\\n" ;;',
        'esac',
      ].join('\n'),
    )
    chmodSync(join(bin, 'tmux'), 0o755)
    chmodSync(join(bin, 'ps'), 0o755)
    const discovery = parseDiscovery(sh(discoveryScript(), `${bin}:/usr/bin:/bin`))!
    expect(discovery.panes.map((pane) => [pane.id, pane.agent])).toEqual([
      ['%1', 'claude'],
      ['%2', undefined],
    ])
    const conversations = conversationsOf('computer-1', discovery).filter((c) => c.path.includes('-work-web'))
    expect(conversations.map((c) => [c.title, c.cwd, c.liveness.kind])).toEqual([
      ['Newest', '/work/web', 'live'],
      ['old', '/work/web', 'ended'],
    ])

    const live = parseDiscovery(sh(liveScript('claude', older, '/work/web'), `${bin}:/usr/bin:/bin`))!
    expect(live.newer).toEqual([newest])
    expect(livenessOf(live, 'claude', '/work/web').kind).toBe('ended')
    const current = parseDiscovery(sh(liveScript('claude', newest, '/work/web'), `${bin}:/usr/bin:/bin`))!
    expect(livenessOf(current, 'claude', '/work/web')).toMatchObject({ kind: 'live', pane: { id: '%1' } })
  })

  test('says when tmux is missing', () => {
    const empty = join(root, 'empty-bin')
    mkdirSync(empty, { recursive: true })
    write(join(empty, 'ps'), '#!/bin/sh\n')
    chmodSync(join(empty, 'ps'), 0o755)
    // Only the fake ps and the core utilities: no tmux anywhere on this PATH.
    const coreutils = ['sh', 'awk', 'grep', 'cut', 'find', 'sed', 'sort', 'head', 'wc', 'tr', 'stat', 'tail', 'cat']
    for (const tool of coreutils) Bun.spawnSync(['ln', '-sf', Bun.which(tool)!, join(empty, tool)])
    const discovery = parseDiscovery(
      sh(discoveryScript().replace(/PATH="[^\n]*"/, `PATH="${empty}"`), empty),
    )!
    expect(discovery.tmux).toBe(false)
  })
})

describe('tmux scripts against a private tmux server', () => {
  const env = () => `${process.env.PATH}`

  /** The pane id and its process, for a session running `command`. */
  const paneOf = (session: string) => {
    const [id, pid] = sh(`tmux list-panes -t ${session} -F '#{pane_id} #{pane_pid}'`, env()).trim().split(' ')
    return { id: id!, pid: Number(pid) }
  }

  test('sendScript types the message exactly, then Enter', async () => {
    const out = join(root, 'typed.txt')
    sh(`tmux new-session -d -s typing -x 200 -y 50 "cat > '${out}'"`, env())
    const pane = paneOf('typing')
    const message = `Fix it: don't run $HOME or \`rm\`\nTHEOREM_not\n"quoted" \\ done`
    const result = afterMark(sh(sendScript(pane.id, pane.pid, message, 'abc123'), env()))
    expect(result).toEqual(['sent'])
    await Bun.sleep(300)
    expect(readFileSync(out, "utf8")).toBe(`${message}\n`)
  })

  test('sendScript types nothing when the agent process no longer holds the pane', async () => {
    const out = join(root, 'not-typed.txt')
    sh(`tmux new-session -d -s other -x 200 -y 50 "cat > '${out}'"`, env())
    const pane = paneOf('other')
    const gone = Bun.spawnSync(['true']).pid
    expect(afterMark(sh(sendScript(pane.id, gone, 'hello', 'tok1'), env()))).toEqual(['refused'])
    // Alive, but not on this pane's terminal.
    expect(afterMark(sh(sendScript(pane.id, process.pid, 'hello', 'tok2'), env()))).toEqual(['refused'])
    expect(afterMark(sh(sendScript('%999999', pane.pid, 'hello', 'tok3'), env()))).toEqual(['refused'])
    await Bun.sleep(300)
    expect(readFileSync(out, 'utf8')).toBe('')
  })

  test('sendScript refuses once an agent started from a shell has exited back to it', async () => {
    const marker = join(root, 'shell-ran-it')
    const pidFile = join(root, 'agent.pid')
    sh(`tmux new-session -d -s shelled -x 200 -y 50 "sh -i"`, env())
    const pane = paneOf('shelled')
    // An interactive shell runs the "agent" as its own foreground job.
    sh(`tmux send-keys -t ${pane.id} 'sh -c "echo \\$\\$ > \\"${pidFile}\\"; exec cat > /dev/null"' Enter`, env())
    for (let i = 0; i < 40 && !readFileSync(pidFile, { flag: 'a+' }).toString().trim(); i++) await Bun.sleep(50)
    const agentPid = Number(readFileSync(pidFile, 'utf8').trim())
    expect(afterMark(sh(sendScript(pane.id, agentPid, 'for the agent', 'tok4'), env()))).toEqual(['sent'])
    process.kill(agentPid)
    await Bun.sleep(300)
    expect(afterMark(sh(sendScript(pane.id, agentPid, `touch '${marker}'`, 'tok5'), env()))).toEqual(['refused'])
    await Bun.sleep(300)
    expect(await Bun.file(marker).exists()).toBe(false)
  })

  test('startScript starts the agent in the folder, with the prompt as one argument', async () => {
    const agentBin = join(root, 'agent-bin')
    const record = join(root, 'agent-args.txt')
    write(join(agentBin, 'claude'), `#!/bin/sh\npwd > '${record}'\nprintf '%s\\n' "$#" "$1" >> '${record}'\nsleep 5\n`)
    chmodSync(join(agentBin, 'claude'), 0o755)
    const folder = join(root, 'project dir')
    mkdirSync(folder, { recursive: true })
    const lines = afterMark(sh(startScript('claude', folder, 'Say "hi" $USER', 'theorem-claude-1', 'tok'), `${agentBin}:${env()}`))!
    expect(lines[0]).toMatch(/^started\ttheorem-claude-1\t%\d+\t\d+$/)
    await Bun.sleep(400)
    expect(readFileSync(record, 'utf8')).toBe(`${folder}\n1\nSay "hi" $USER\n`)
  })

  test('startScript names what is missing', () => {
    // Neither the runner's PATH nor the script's fallback directories (/opt/homebrew/bin,
    // /usr/local/bin), which may hold a real codex: only a stand-in tmux and the core utilities.
    const noCodex = join(root, 'no-codex-bin')
    mkdirSync(noCodex, { recursive: true })
    write(join(noCodex, 'tmux'), '#!/bin/sh\n')
    chmodSync(join(noCodex, 'tmux'), 0o755)
    for (const tool of ['sh', 'cat']) Bun.spawnSync(['ln', '-sf', Bun.which(tool)!, join(noCodex, tool)])
    const start = startScript('codex', join(root, 'project dir'), 'x', 's', 't').replace(
      /PATH="[^\n]*"/,
      `PATH="${noCodex}"`,
    )
    expect(afterMark(sh(start, noCodex))).toEqual(['missing\tcodex'])
    const agentBin = join(root, 'agent-bin')
    expect(afterMark(sh(startScript('claude', join(root, 'no-such-dir'), 'x', 's2', 't'), `${agentBin}:${env()}`))).toEqual([
      'missing\tfolder',
    ])
  })

  test('findStartedLogScript finds the log the new session wrote', () => {
    const folder = join(root, 'project dir')
    const since = Math.floor(Date.now() / 1000) - 5
    const log = join(home, '.codex/sessions/2026/11/08/rollout-2026-11-08T10-00-00-abc.jsonl')
    write(log, `${JSON.stringify({ type: 'session_meta', payload: { id: 'abc', cwd: folder } })}\n`)
    expect(afterMark(sh(findStartedLogScript('codex', folder, since)))).toEqual([`log\t${log}`])
    expect(afterMark(sh(findStartedLogScript('codex', join(root, 'elsewhere'), since)))).toEqual([])
  })
})
