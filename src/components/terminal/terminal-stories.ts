// SOURCING: none — committed fixtures for the terminal's stories, built through snapshotOf so a story draws exactly what a live thread would; the thread shape is assistant-ui's ThreadMessage
//
// Each story is one deterministic terminal state: a fixed thread, a fixed
// outbox, a fixed run state. The story route mounts the real WASM terminal on
// it; nothing reaches Theorem.
import { snapshotOf } from './terminal-transcript'
import type { Outgoing } from './terminal-transcript'
import type { ThreadMessage } from '@assistant-ui/react'

type Part = Record<string, unknown>

function message(
  id: string,
  role: 'user' | 'assistant',
  content: Part[],
  running = false,
): ThreadMessage {
  return {
    id,
    role,
    content,
    createdAt: new Date(0),
    metadata: { custom: { theoremRunId: 'story-run' } },
    status: running
      ? { type: 'running' }
      : { type: 'complete', reason: 'stop' },
  } as unknown as ThreadMessage
}

function tool(
  id: string,
  toolName: string,
  args: Record<string, unknown>,
  result?: string,
) {
  return {
    type: 'tool-call',
    toolCallId: id,
    toolName,
    args,
    argsText: JSON.stringify(args),
    result,
  }
}

function input(inputId: string, text: string, status: string, reason?: string) {
  return {
    type: 'data',
    name: 'theorem-user_input',
    data: {
      type: 'user_input',
      partId: `part-${inputId}`,
      inputId,
      text,
      status,
      reason,
    },
  }
}

const text = (value: string) => ({ type: 'text', text: value })

export type TerminalStory = {
  id: string
  title: string
  /** What the story pins down, for whoever reads the collage. */
  claim: string
  messages: ThreadMessage[]
  outbox: Outgoing[]
  running: boolean
}

export const TERMINAL_STORIES: TerminalStory[] = [
  {
    id: 'terminal-input-states',
    title: 'Sending while the agent works',
    claim:
      'Words sent mid-run show where the run took them in, and each one not yet taken says how far it got.',
    running: true,
    messages: [
      message('u1', 'user', [text('Fix the failing parser test')]),
      message(
        'a1',
        'assistant',
        [
          tool('c1', 'search_code', { query: 'parse_header' }, 'found 3'),
          input('in-1', 'skip the docs folder', 'delivered'),
          tool('c2', 'read_file', { path: 'src/parser.rs' }, 'ok'),
          text(
            'The header parser drops the last field when the line has no trailing comma.',
          ),
          tool('c3', 'run_tests', { filter: 'parser' }),
        ],
        true,
      ),
    ],
    outbox: [
      {
        id: 'o1',
        text: 'skip the docs folder',
        state: 'sent',
        inputId: 'in-1',
      },
      {
        id: 'o2',
        text: 'and keep the old error message',
        state: 'sent',
        inputId: 'in-2',
      },
      { id: 'o3', text: 'also check the CSV path', state: 'sending' },
      { id: 'o4', text: 'rename the flag too', state: 'next' },
      {
        id: 'o5',
        text: 'one more thing',
        state: 'failed',
        error: 'Sign in to continue.',
      },
    ],
  },
  {
    id: 'terminal-code',
    title: 'Highlighted code and diffs',
    claim:
      "Fenced code in an answer draws in pi's syntax roles on the slate; a diff marks added and removed lines.",
    running: false,
    messages: [
      message('u1', 'user', [text('Show me the fix')]),
      message('a1', 'assistant', [
        text(
          [
            'The guard was inverted. In `src/parser.rs`:',
            '',
            '```rust',
            '// Keep the last field even without a trailing comma.',
            'pub fn fields(line: &str) -> Vec<&str> {',
            "    let trimmed = line.strip_suffix(',').unwrap_or(line);",
            "    trimmed.split(',').map(str::trim).collect()",
            '}',
            '```',
            '',
            'The change:',
            '',
            '```diff',
            '@@ -12,3 +12,3 @@ pub fn fields(line: &str) -> Vec<&str> {',
            "-    let trimmed = line.trim_end_matches(',');",
            "+    let trimmed = line.strip_suffix(',').unwrap_or(line);",
            "     trimmed.split(',').map(str::trim).collect()",
            '```',
            '',
            'And the caller in TypeScript:',
            '',
            '```ts',
            'export const header = (line: string): string[] => fields(line, { strict: true })',
            '```',
          ].join('\n'),
        ),
      ]),
    ],
    outbox: [],
  },
]

/** A story's snapshot JSON, as the terminal session would hold it. */
export function storySnapshot(story: TerminalStory) {
  return snapshotOf(story.messages, story.running, 'theorem', story.outbox).json
}
