// SOURCING: bun:test over the add and edit forms' zod validation
import { expect, test } from 'bun:test'
import type { McpServer } from '@/lib/theorem/connections'
import {
  draftFromServer,
  emptyDraft,
  validateNewServer,
  validateServerEdit,
} from './server-form'
import type { ServerDraft } from './server-form'

const draft = (changes: Partial<ServerDraft>): ServerDraft => ({
  ...emptyDraft,
  ...changes,
})
const web = { stdioAvailable: false }
const local = { stdioAvailable: true }

const server = (changes: Partial<McpServer> = {}): McpServer => ({
  id: 'mcp:abc',
  kind: 'mcp',
  label: 'Docs',
  status: 'connected',
  enabled: true,
  health: { state: 'ok' },
  transport: 'http',
  url: 'https://mcp.example.com/mcp',
  auth: { type: 'none', configured: false },
  tools: [],
  ...changes,
})

test('an empty form asks for a name and an address', () => {
  const result = validateNewServer(emptyDraft, web)
  expect(result).toEqual({
    ok: false,
    errors: {
      label: 'Give the server a name.',
      url: 'Enter the server address.',
    },
  })
})

test('a name of only spaces is no name, and a very long one is refused', () => {
  expect(validateNewServer(draft({ label: '   ', url: 'https://x.test' }), web)).toMatchObject({
    ok: false,
    errors: { label: 'Give the server a name.' },
  })
  expect(
    validateNewServer(draft({ label: 'x'.repeat(81), url: 'https://x.test' }), web),
  ).toMatchObject({ ok: false, errors: { label: 'Keep the name under 80 characters.' } })
})

test('an address must be http or https', () => {
  for (const url of ['mcp.example.com', 'ftp://mcp.example.com', 'javascript:alert(1)', 'not a url']) {
    expect(validateNewServer(draft({ label: 'Docs', url }), web)).toMatchObject({
      ok: false,
      errors: {
        url: 'Enter the server address, starting with https:// or http://.',
      },
    })
  }
})

test('a web server with no sign-in is saved with its trimmed name and address', () => {
  expect(
    validateNewServer(draft({ label: '  Docs ', url: ' https://mcp.example.com/mcp ' }), web),
  ).toEqual({
    ok: true,
    value: {
      label: 'Docs',
      transport: 'http',
      url: 'https://mcp.example.com/mcp',
      auth: { type: 'none' },
    },
  })
})

test('a bearer token is required, and is the only secret the request carries', () => {
  const form = draft({ label: 'Docs', url: 'https://x.test/mcp', auth: 'bearer' })
  expect(validateNewServer(form, web)).toMatchObject({
    ok: false,
    errors: { token: 'Enter the token the server expects.' },
  })
  expect(validateNewServer({ ...form, token: ' s3cret ' }, web)).toMatchObject({
    ok: true,
    value: { auth: { type: 'bearer', token: 's3cret' } },
  })
})

test('signing in with a provider asks for no token', () => {
  expect(
    validateNewServer(
      draft({ label: 'Docs', url: 'https://x.test/mcp', auth: 'oauth', token: 'ignored' }),
      web,
    ),
  ).toMatchObject({ ok: true, value: { auth: { type: 'oauth' } } })
})

test('a local server needs a local runtime, and a command', () => {
  const form = draft({ label: 'Files', transport: 'stdio' })
  expect(validateNewServer({ ...form, command: 'npx' }, web)).toMatchObject({
    ok: false,
    errors: { command: 'Local servers need a connected local runtime.' },
  })
  expect(validateNewServer(form, local)).toMatchObject({
    ok: false,
    errors: { command: 'Enter the command that starts the server.' },
  })
})

test('a local server saves its command and one argument per line, with no address', () => {
  expect(
    validateNewServer(
      draft({
        label: 'Files',
        transport: 'stdio',
        command: ' npx ',
        args: '-y\n @modelcontextprotocol/server-filesystem \n\n/Users/me/notes\n',
        url: 'https://ignored.test',
      }),
      local,
    ),
  ).toEqual({
    ok: true,
    value: {
      label: 'Files',
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@modelcontextprotocol/server-filesystem', '/Users/me/notes'],
      auth: { type: 'none' },
    },
  })
})

test('every problem is reported at once, not one per attempt', () => {
  expect(
    validateNewServer(draft({ auth: 'bearer', url: 'nope' }), web),
  ).toEqual({
    ok: false,
    errors: {
      label: 'Give the server a name.',
      url: 'Enter the server address, starting with https:// or http://.',
      token: 'Enter the token the server expects.',
    },
  })
})

test('editing starts from the saved server, never from its secret', () => {
  expect(
    draftFromServer(
      server({
        transport: 'stdio',
        url: undefined,
        command: 'npx',
        args: ['-y', 'pkg'],
        auth: { type: 'bearer', configured: true },
      }),
    ),
  ).toEqual({
    label: 'Docs',
    transport: 'stdio',
    url: '',
    command: 'npx',
    args: '-y\npkg',
    auth: 'bearer',
    token: '',
  })
})

test('an edit that changes nothing is an empty patch', () => {
  const saved = server()
  expect(validateServerEdit(saved, draftFromServer(saved))).toEqual({
    ok: true,
    value: {},
  })
})

test('an edit sends only the name when only the name changed', () => {
  const saved = server()
  expect(
    validateServerEdit(saved, { ...draftFromServer(saved), label: ' Renamed ' }),
  ).toEqual({ ok: true, value: { label: 'Renamed' } })
})

test('the address cannot be edited, so a stale or empty one is not an error', () => {
  const saved = server()
  expect(
    validateServerEdit(saved, { ...draftFromServer(saved), url: '' }),
  ).toEqual({ ok: true, value: {} })
})

test('a blank token keeps the stored one, and a new one replaces it', () => {
  const saved = server({ auth: { type: 'bearer', configured: true } })
  expect(validateServerEdit(saved, draftFromServer(saved))).toEqual({
    ok: true,
    value: {},
  })
  expect(
    validateServerEdit(saved, { ...draftFromServer(saved), token: 'fresh' }),
  ).toEqual({ ok: true, value: { auth: { type: 'bearer', token: 'fresh' } } })
})

test('moving to a bearer token needs one, unless one is already stored', () => {
  const saved = server()
  expect(
    validateServerEdit(saved, { ...draftFromServer(saved), auth: 'bearer' }),
  ).toMatchObject({ ok: false, errors: { token: 'Enter the token the server expects.' } })
})

test('moving to sign-in with a provider drops the token', () => {
  const saved = server({ auth: { type: 'bearer', configured: true } })
  expect(
    validateServerEdit(saved, { ...draftFromServer(saved), auth: 'oauth' }),
  ).toEqual({ ok: true, value: { auth: { type: 'oauth' } } })
})
