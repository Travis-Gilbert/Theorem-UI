// SOURCING: zod (the add and edit forms' validation; already a dependency) over the request shapes in lib/theorem/connections
import { z } from 'zod'
import type {
  McpAuthType,
  McpServer,
  McpServerPatch,
  NewMcpServer,
} from '@/lib/theorem/connections'

/** What the add and edit forms hold while a person types; everything is text. */
export type ServerDraft = {
  label: string
  transport: 'http' | 'stdio'
  url: string
  command: string
  /** One argument per line, so no quoting rules are needed. */
  args: string
  auth: McpAuthType
  token: string
}

export const emptyDraft: ServerDraft = {
  label: '',
  transport: 'http',
  url: '',
  command: '',
  args: '',
  auth: 'none',
  token: '',
}

export type DraftField = 'label' | 'url' | 'command' | 'token'
export type DraftErrors = Partial<Record<DraftField, string>>

export type Validated<T> =
  | { ok: true; value: T }
  | { ok: false; errors: DraftErrors }

const lines = (text: string) =>
  text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

const label = z
  .string()
  .trim()
  .min(1, 'Give the server a name.')
  .max(80, 'Keep the name under 80 characters.')

const address = z.url({
  protocol: /^https?$/,
  error: 'Enter the server address, starting with https:// or http://.',
})

const draftSchema = (options: {
  stdioAvailable: boolean
  /** A bearer token is already stored, so the field may stay empty. */
  keepsToken: boolean
  /** The address cannot change after a server is saved. */
  addressLocked: boolean
}) =>
  z
    .object({
      label,
      transport: z.enum(['http', 'stdio']),
      url: z.string().trim(),
      command: z.string().trim(),
      args: z.string(),
      auth: z.enum(['none', 'bearer', 'oauth']),
      token: z.string().trim(),
    })
    .superRefine((draft, context) => {
      if (!options.addressLocked) {
        if (draft.transport === 'http' && !address.safeParse(draft.url).success)
          context.addIssue({
            code: 'custom',
            path: ['url'],
            message: draft.url
              ? 'Enter the server address, starting with https:// or http://.'
              : 'Enter the server address.',
          })
        if (draft.transport === 'stdio') {
          if (!options.stdioAvailable)
            context.addIssue({
              code: 'custom',
              path: ['command'],
              message: 'Local servers need a connected local runtime.',
            })
          else if (!draft.command)
            context.addIssue({
              code: 'custom',
              path: ['command'],
              message: 'Enter the command that starts the server.',
            })
        }
      }
      if (draft.auth === 'bearer' && !draft.token && !options.keepsToken)
        context.addIssue({
          code: 'custom',
          path: ['token'],
          message: 'Enter the token the server expects.',
        })
    })

const refused = (error: z.ZodError): { ok: false; errors: DraftErrors } => {
  const errors: DraftErrors = {}
  for (const issue of error.issues) {
    const field = issue.path[0] as DraftField
    errors[field] ??= issue.message
  }
  return { ok: false, errors }
}

/** The request that saves a new server, or what is wrong with the form. */
export function validateNewServer(
  draft: ServerDraft,
  options: { stdioAvailable: boolean },
): Validated<NewMcpServer> {
  const parsed = draftSchema({
    ...options,
    keepsToken: false,
    addressLocked: false,
  }).safeParse(draft)
  if (!parsed.success) return refused(parsed.error)
  const value = parsed.data
  return {
    ok: true,
    value: {
      label: value.label,
      transport: value.transport,
      ...(value.transport === 'http'
        ? { url: value.url }
        : { command: value.command, args: lines(value.args) }),
      auth:
        value.auth === 'bearer'
          ? { type: 'bearer', token: value.token }
          : { type: value.auth },
    },
  }
}

/** The form for a saved server: its name and how it signs in, never its address. */
export function draftFromServer(server: McpServer): ServerDraft {
  return {
    label: server.label,
    transport: server.transport,
    url: server.url ?? '',
    command: server.command ?? '',
    args: (server.args ?? []).join('\n'),
    auth: server.auth.type,
    token: '',
  }
}

/**
 * The patch that applies an edit, or what is wrong with the form. A patch with
 * nothing in it means nothing changed. A blank token keeps the stored one.
 */
export function validateServerEdit(
  server: McpServer,
  draft: ServerDraft,
): Validated<McpServerPatch> {
  const parsed = draftSchema({
    stdioAvailable: true,
    keepsToken: server.auth.type === 'bearer' && server.auth.configured,
    addressLocked: true,
  }).safeParse(draft)
  if (!parsed.success) return refused(parsed.error)
  const value = parsed.data
  const patch: McpServerPatch = {}
  if (value.label !== server.label) patch.label = value.label
  if (value.auth !== server.auth.type || value.token)
    patch.auth =
      value.auth === 'bearer' && value.token
        ? { type: 'bearer', token: value.token }
        : { type: value.auth }
  return { ok: true, value: patch }
}
