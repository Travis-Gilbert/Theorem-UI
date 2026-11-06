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

function data(name: string, payload: Record<string, unknown>) {
  return { type: 'data', name: `theorem-${name}`, data: payload }
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
  /** Keys the oracle presses after the story draws, as Playwright names them. */
  keys?: string[]
  /** References waiting on the prompt, as the terminal labels them. */
  references?: string[]
  /** Text the oracle clicks after the story draws; the story records the action. */
  click?: string
}

const PROGRAM = [
  "hits = search_code(query='parse_header')",
  'for hit in hits[:2]:',
  '    source = read_file(path=hit.path)',
  "    if 'trim_end_matches' in source:",
  "        print(hit.path, 'keeps a trailing comma')",
  "{'checked': len(hits)}",
].join('\n')

const PARSER = [
  'pub fn fields(line: &str) -> Vec<&str> {',
  "    let trimmed = line.trim_end_matches(',');",
  "    trimmed.split(',').map(str::trim).collect()",
  '}',
].join('\n')

const EDIT = [
  '--- a/src/parser.rs',
  '+++ b/src/parser.rs',
  '@@ -2,2 +2,2 @@',
  "-    let trimmed = line.trim_end_matches(',');",
  "+    let trimmed = line.strip_suffix(',').unwrap_or(line);",
  "     trimmed.split(',').map(str::trim).collect()",
].join('\n')

/** A run that has done some work and is writing up what it found. */
function activity(): ThreadMessage[] {
  return [
    message('u1', 'user', [text('Why does the parser drop the last field?')]),
    message(
      'a1',
      'assistant',
      [
        data('program', { source: PROGRAM, streaming: false }),
        data('host_call', {
          name: 'search_code',
          effect: 'read',
          state: 'succeeded',
        }),
        data('host_call', {
          name: 'read_file',
          effect: 'read',
          state: 'succeeded',
        }),
        data('host_call', {
          name: 'read_file',
          effect: 'read',
          state: 'succeeded',
        }),
        tool('c1', 'read_file', { path: 'src/parser.rs' }, PARSER),
        tool('c2', 'edit_file', { path: 'src/parser.rs' }, EDIT),
        data('progress', { label: 'Writing up the fix', status: 'running' }),
        text(
          'It trims every trailing comma, so a line ending in an empty field loses it. The fix keeps',
        ),
      ],
      true,
    ),
  ]
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
  {
    id: 'terminal-activity',
    title: 'Compact activity while the agent writes',
    claim:
      'Finished work folds into compact rows (three or more tools as one line, a finished program as one row); the caret marks where the agent is writing; the status names what the run is doing.',
    running: true,
    messages: activity(),
    outbox: [],
  },
  {
    id: 'terminal-activity-expanded',
    title: 'Tool output shown with ctrl+o',
    claim:
      "ctrl+o unfolds the same transcript: every tool row, the program it ran, and each tool's output highlighted under its row (file content in its language, an edit as a diff).",
    running: true,
    messages: activity(),
    outbox: [],
    keys: ['Control+o'],
  },
  {
    id: 'terminal-program-streaming',
    title: 'Watching the agent type its program',
    claim:
      'The program the native agent is writing streams in as highlighted code, with the caret at the end of what has arrived.',
    running: true,
    messages: [
      message('u1', 'user', [
        text('Check every parser for the trailing comma bug'),
      ]),
      message(
        'a1',
        'assistant',
        [
          data('progress', { label: 'Writing a program', status: 'running' }),
          data('program', {
            source: PROGRAM.split('\n').slice(0, 4).join('\n'),
            streaming: true,
          }),
        ],
        true,
      ),
    ],
    outbox: [],
  },
  {
    id: 'terminal-references',
    title: 'Code rows open in the IDE; references ride the next turn',
    claim:
      "A tool row that names a file is a link: clicking it asks the IDE to open that file at the lines the tool read or changed. Lines sent from the editor's Add to chat wait over the prompt as references for the next turn, and backspace on an empty prompt drops the last one.",
    running: false,
    messages: [
      message('u1', 'user', [text('Why does the parser drop the last field?')]),
      message('a1', 'assistant', [
        tool(
          'c1',
          'read_file',
          { path: 'src/parser.rs', offset: 1, limit: 4 },
          PARSER,
        ),
        tool('c2', 'edit_file', { path: 'src/parser.rs' }, EDIT),
        text(
          'It trimmed every trailing comma, so a line ending in an empty field lost it. It now strips one.',
        ),
      ]),
    ],
    outbox: [],
    references: ['src/parser.rs:2-3', 'tests/parser.rs'],
    click: 'edit_file',
  },
]

/** A story's snapshot JSON, as the terminal session would hold it. */
export function storySnapshot(story: TerminalStory) {
  return snapshotOf(
    story.messages,
    story.running,
    'theorem',
    story.outbox,
    story.references,
  ).json
}
