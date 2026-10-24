// SOURCING: platform fetch for the Index workspace and document filing routes (the SDK has no client for them yet), the shared CSRF/idempotency helper from lib/theorem/client, @theoremharness/sdk for document reads
import { TheoremError } from '@theoremharness/sdk'
import { mutate, theorem } from '@/lib/theorem/client'
import type { MutationHeaders } from '@/lib/theorem/client'
import { DOCUMENT_SCHEMA, scopeParams } from './contract'
import type {
  Binding,
  Collection,
  CorrectionReceipt,
  FilingReceipt,
  IndexPolicy,
  IndexView,
  Interpretation,
  ObservationEvent,
  Operation,
  Preference,
  PreferenceStatement,
  Proposal,
  ProposalStatus,
  PublishedLibrary,
  QueryResult,
  Scope,
  ViewRevision,
} from './contract'

const WORKSPACE = '/api/index/v1'
const DOCUMENTS = '/api/documents/v2'

/**
 * Errors keep the SDK's shape, so describeError and isSignedOut read the
 * problem body the same way for these routes as for the SDK's own.
 */
async function read<T>(response: Response): Promise<T> {
  const text = await response.text()
  const body = text ? (JSON.parse(text) as unknown) : undefined
  if (!response.ok)
    throw new TheoremError({
      message: `${response.status} ${response.statusText}`,
      statusCode: response.status,
      body,
    })
  return body as T
}

function url(path: string, params?: Record<string, string | undefined>) {
  const target = new URL(path, window.location.origin)
  for (const [key, value] of Object.entries(params ?? {}))
    if (value !== undefined) target.searchParams.set(key, value)
  return target
}

export async function get<T>(
  path: string,
  params?: Record<string, string | undefined>,
): Promise<T> {
  return read<T>(await fetch(url(path, params), { credentials: 'same-origin' }))
}

/** A write with CSRF and an idempotency key; the filing routes also want the key in the body. */
async function send<T>(
  method: 'POST' | 'PUT',
  path: string,
  body: (headers: MutationHeaders) => unknown,
  extraHeaders?: Record<string, string>,
  keepalive = false,
): Promise<T> {
  return mutate(async (headers) =>
    read<T>(
      await fetch(url(path), {
        method,
        credentials: 'same-origin',
        keepalive,
        headers: {
          'content-type': 'application/json',
          ...headers,
          ...extraHeaders,
        },
        body: JSON.stringify(body(headers)),
      }),
    ),
  )
}

const post = <T>(path: string, body: unknown) =>
  send<T>('POST', path, () => body)

// Views

export const listViews = (scope: Scope, archived = false) =>
  get<{ views: IndexView[] }>(`${WORKSPACE}/views`, {
    ...scopeParams(scope),
    archived: archived ? 'true' : undefined,
  }).then((r) => r.views)

export const readView = (viewId: string) =>
  get<{ view: IndexView; revisions: ViewRevision[] }>(
    `${WORKSPACE}/views/${encodeURIComponent(viewId)}`,
  )

export type ViewDraft = {
  title: string
  purpose: string
  program: string
  bindings: Record<string, Binding>
  operations: Operation[]
  note: string
}

export const createView = (scope: Scope, draft: ViewDraft) =>
  post<{ view: IndexView }>(`${WORKSPACE}/views`, {
    scope,
    origin: 'user',
    ...draft,
  }).then((r) => r.view)

export const reviseView = (
  viewId: string,
  expectedRevision: number,
  draft: ViewDraft,
) =>
  post<{ view: IndexView }>(
    `${WORKSPACE}/views/${encodeURIComponent(viewId)}/revisions`,
    { expectedRevision, ...draft },
  ).then((r) => r.view)

export const restoreView = (
  viewId: string,
  expectedRevision: number,
  revision: number,
) =>
  post<{ view: IndexView }>(
    `${WORKSPACE}/views/${encodeURIComponent(viewId)}/restore`,
    { expectedRevision, revision },
  ).then((r) => r.view)

export const pinView = (viewId: string, pinned: boolean) =>
  post<{ view: IndexView }>(
    `${WORKSPACE}/views/${encodeURIComponent(viewId)}/pin`,
    { pinned },
  ).then((r) => r.view)

export const archiveView = (viewId: string, archived: boolean) =>
  post<{ view: IndexView }>(
    `${WORKSPACE}/views/${encodeURIComponent(viewId)}/archive`,
    { archived },
  ).then((r) => r.view)

// Bindings

export const runBinding = (binding: Binding) =>
  post<QueryResult>(`${WORKSPACE}/query`, { binding })

// Learning signal

/** `keepalive` lets the last batch outlive a page being hidden or closed. */
export const recordObservations = (
  sessionId: string,
  events: ObservationEvent[],
  keepalive = false,
) =>
  send<{ accepted: number }>(
    'POST',
    `${WORKSPACE}/observations`,
    () => ({ sessionId, events }),
    undefined,
    keepalive,
  )

export const listInterpretations = (scope: Scope) =>
  get<{ interpretations: Interpretation[] }>(
    `${WORKSPACE}/interpretations`,
    scopeParams(scope),
  ).then((r) => r.interpretations)

export const listPreferences = (scope: Scope) =>
  get<{ preferences: Preference[] }>(
    `${WORKSPACE}/preferences`,
    scopeParams(scope),
  ).then((r) => r.preferences)

export const setPreference = (input: {
  scope: Scope
  statement: PreferenceStatement
  viewId?: string
  subjects?: string[]
  value?: string
  note?: string
}) =>
  post<{ preference: Preference }>(`${WORKSPACE}/preferences`, input).then(
    (r) => r.preference,
  )

// Proposals and policy

export const listProposals = (scope: Scope, status: ProposalStatus[]) =>
  get<{ proposals: Proposal[] }>(`${WORKSPACE}/proposals`, {
    ...scopeParams(scope),
    status: status.join(','),
  }).then((r) => r.proposals)

const proposalPath = (proposalId: string, action: string) =>
  `${WORKSPACE}/proposals/${encodeURIComponent(proposalId)}/${action}`

export const acceptProposal = (proposalId: string) =>
  post<{ proposal: Proposal; view: IndexView }>(
    proposalPath(proposalId, 'accept'),
    {},
  )

export const dismissProposal = (proposalId: string, reason?: string) =>
  post<{ proposal: Proposal }>(proposalPath(proposalId, 'dismiss'), {
    reason,
  }).then((r) => r.proposal)

export const revertProposal = (proposalId: string) =>
  post<{ proposal: Proposal; view: IndexView }>(
    proposalPath(proposalId, 'revert'),
    {},
  )

export const recordValidation = (
  proposalId: string,
  result: { ok: boolean; detail: string },
) =>
  post<{ proposal: Proposal }>(
    proposalPath(proposalId, 'validation'),
    result,
  ).then((r) => r.proposal)

export const readPolicy = () =>
  get<{ policy: IndexPolicy }>(`${WORKSPACE}/policy`).then((r) => r.policy)

export const writePolicy = (policy: IndexPolicy) =>
  send<{ policy: IndexPolicy }>(
    'PUT',
    `${WORKSPACE}/policy`,
    () => policy,
  ).then((r) => r.policy)

// Component library

/** A tenant that has never published answers 409 `index_library_missing`. */
export const readLibrary = () =>
  get<PublishedLibrary>(`${WORKSPACE}/library`).catch((error: unknown) => {
    if (
      error instanceof TheoremError &&
      (error.body as { code?: string } | undefined)?.code ===
        'index_library_missing'
    )
      return undefined
    throw error
  })

export const publishLibrary = (
  library: PublishedLibrary & { prompt: string },
) => send<PublishedLibrary>('PUT', `${WORKSPACE}/library`, () => library)

// Documents, collections and filing (theorem-document/2)

export const readDocument = (documentId: string) =>
  theorem().documents.get({ documentId, schema: DOCUMENT_SCHEMA })

type CollectionPage = {
  collections: {
    collectionId: string
    name: string
    kind: 'manual' | 'auto'
    documentIds: string[]
  }[]
}

export const listCollections = (): Promise<Collection[]> =>
  get<CollectionPage>(`${DOCUMENTS}/collections`, {
    schema: DOCUMENT_SCHEMA,
  }).then((page) =>
    page.collections.map(({ collectionId, name, kind, documentIds }) => ({
      collectionId,
      name,
      kind,
      documentCount: documentIds.length,
    })),
  )

export const createCollection = (name: string) =>
  send<{ collectionId: string }>(
    'POST',
    `${DOCUMENTS}/collections`,
    (headers) => ({
      schema: DOCUMENT_SCHEMA,
      idempotencyKey: headers['Idempotency-Key'],
      name,
      kind: 'manual',
    }),
  )

export const filingHistory = (documentId: string) =>
  get<{ receipts: FilingReceipt[] }>(
    `${DOCUMENTS}/documents/${encodeURIComponent(documentId)}/filings`,
    { schema: DOCUMENT_SCHEMA },
  ).then((r) => r.receipts)

export const fileDocument = (
  documentId: string,
  expectedRevision: { position: number; contentDigest: string },
) =>
  send<FilingReceipt>(
    'POST',
    `${DOCUMENTS}/documents/${encodeURIComponent(documentId)}/filings`,
    (headers) => ({
      schema: DOCUMENT_SCHEMA,
      idempotencyKey: headers['Idempotency-Key'],
      documentId,
      expectedRevision,
    }),
    { 'If-Match': String(expectedRevision.position) },
  )

export const correctFiling = (
  receiptId: string,
  destinationCollectionId: string,
) =>
  send<CorrectionReceipt>(
    'POST',
    `${DOCUMENTS}/filings/${encodeURIComponent(receiptId)}/corrections`,
    (headers) => ({
      schema: DOCUMENT_SCHEMA,
      idempotencyKey: headers['Idempotency-Key'],
      receiptId,
      destinationCollectionId,
    }),
  )

export const undoCorrection = (correctionId: string) =>
  send<CorrectionReceipt>(
    'POST',
    `${DOCUMENTS}/filing-corrections/${encodeURIComponent(correctionId)}/undo`,
    (headers) => ({
      schema: DOCUMENT_SCHEMA,
      idempotencyKey: headers['Idempotency-Key'],
      correctionId,
    }),
  )
