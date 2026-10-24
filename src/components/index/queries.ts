// SOURCING: @tanstack/react-query (server state for the Index workspace, documents and filing through ./api)
import {
  useMutation,
  useMutationState,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { isSignedOut } from '@/lib/theorem/client'
import * as api from './api'
import type { ViewDraft } from './api'
import { scopeKey } from './contract'
import type {
  Binding,
  IndexPolicy,
  IndexView,
  PreferenceStatement,
  Proposal,
  Scope,
} from './contract'
import { libraryRecord } from './library'
import { observer } from './observe'

const INDEX = ['theorem', 'index'] as const
const keys = {
  views: (scope: Scope, archived: boolean) =>
    [...INDEX, 'views', scopeKey(scope), archived] as const,
  view: (viewId: string) => [...INDEX, 'view', viewId] as const,
  proposals: (scope: Scope) =>
    [...INDEX, 'proposals', scopeKey(scope)] as const,
  interpretations: (scope: Scope) =>
    [...INDEX, 'interpretations', scopeKey(scope)] as const,
  policy: [...INDEX, 'policy'] as const,
  library: [...INDEX, 'library'] as const,
  collections: [...INDEX, 'collections'] as const,
  binding: (binding: Binding) => [...INDEX, 'binding', binding] as const,
  document: (documentId: string) => [...INDEX, 'document', documentId] as const,
  filings: (documentId: string) => [...INDEX, 'filings', documentId] as const,
}

/** Writes that change filing, so a running view knows to read again. */
const MATERIAL = [...INDEX, 'material'] as const

const retry = (failures: number, error: unknown) =>
  !isSignedOut(error) && failures < 1

export const useCollections = () =>
  useQuery({
    queryKey: keys.collections,
    queryFn: api.listCollections,
    staleTime: 30_000,
    retry,
  })

export const useViews = (scope: Scope, archived = false) =>
  useQuery({
    queryKey: keys.views(scope, archived),
    queryFn: () => api.listViews(scope, archived),
    staleTime: 10_000,
    // The improver adds views in the background, on the proposals' rhythm.
    refetchInterval: 60_000,
    retry,
  })

export const useStoredView = (viewId: string | undefined) =>
  useQuery({
    queryKey: keys.view(viewId ?? ''),
    queryFn: () => api.readView(viewId!),
    enabled: !!viewId,
    // The improver works in the background; a quiet poll shows its results.
    refetchInterval: 60_000,
    retry,
  })

export const useProposals = (scope: Scope) =>
  useQuery({
    queryKey: keys.proposals(scope),
    queryFn: () => api.listProposals(scope, ['proposed', 'applied']),
    refetchInterval: 60_000,
    retry,
  })

export const useInterpretations = (scope: Scope, enabled: boolean) =>
  useQuery({
    queryKey: keys.interpretations(scope),
    queryFn: () => api.listInterpretations(scope),
    enabled,
    retry,
  })

export const usePolicy = () =>
  useQuery({ queryKey: keys.policy, queryFn: api.readPolicy, retry })

export const useBinding = (binding: Binding | undefined) =>
  useQuery({
    queryKey: keys.binding(binding ?? { kind: 'collections' }),
    queryFn: () => api.runBinding(binding!),
    enabled: !!binding,
    staleTime: 10_000,
    retry,
  })

export const useDocument = (documentId: string | undefined) =>
  useQuery({
    queryKey: keys.document(documentId ?? ''),
    queryFn: () => api.readDocument(documentId!),
    enabled: !!documentId,
    retry,
  })

export const useFilings = (documentId: string | undefined) =>
  useQuery({
    queryKey: keys.filings(documentId ?? ''),
    queryFn: () => api.filingHistory(documentId!),
    enabled: !!documentId,
    retry,
  })

/**
 * Publishes this build's component library when Theorem holds a different
 * one, so the improver composes against exactly what this build renders.
 */
export const useLibraryPublication = () =>
  useQuery({
    queryKey: keys.library,
    queryFn: async () => {
      const [published, record] = await Promise.all([
        api.readLibrary(),
        libraryRecord(),
      ])
      if (published?.digest === record.digest) return published
      return api.publishLibrary(record)
    },
    staleTime: Infinity,
    retry,
  })

/** Every write that changes views refreshes the lists, the view and the proposals. */
function useInvalidateIndex() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === INDEX[0] &&
        queryKey[1] === INDEX[1] &&
        ['views', 'view', 'proposals'].includes(String(queryKey[2])),
    })
}

function useViewWrite<TArgs>(run: (args: TArgs) => Promise<IndexView>) {
  const invalidate = useInvalidateIndex()
  return useMutation({ mutationFn: run, onSuccess: () => invalidate() })
}

export const useCreateView = () =>
  useViewWrite(({ scope, draft }: { scope: Scope; draft: ViewDraft }) =>
    api.createView(scope, draft),
  )

export const useReviseView = () =>
  useViewWrite(
    ({
      viewId,
      expectedRevision,
      draft,
    }: {
      viewId: string
      expectedRevision: number
      draft: ViewDraft
    }) => api.reviseView(viewId, expectedRevision, draft),
  )

export const useRestoreView = () =>
  useViewWrite(
    ({
      viewId,
      expectedRevision,
      revision,
    }: {
      viewId: string
      expectedRevision: number
      revision: number
    }) => api.restoreView(viewId, expectedRevision, revision),
  )

export const usePinView = () =>
  useViewWrite(({ viewId, pinned }: { viewId: string; pinned: boolean }) =>
    api.pinView(viewId, pinned),
  )

export const useArchiveView = () =>
  useViewWrite(({ viewId, archived }: { viewId: string; archived: boolean }) =>
    api.archiveView(viewId, archived),
  )

export function useProposalAction() {
  const invalidate = useInvalidateIndex()
  return useMutation({
    mutationFn: async ({
      proposal,
      action,
      reason,
    }: {
      proposal: Proposal
      action: 'accept' | 'dismiss' | 'revert'
      reason?: string
    }) => {
      if (action === 'accept') return api.acceptProposal(proposal.proposalId)
      if (action === 'revert') return api.revertProposal(proposal.proposalId)
      observer().record({
        kind: 'proposal_dismissed',
        scope: proposal.scope,
        viewId: proposal.targetViewId,
        detail: { proposalId: proposal.proposalId },
      })
      return {
        proposal: await api.dismissProposal(proposal.proposalId, reason),
      }
    },
    onSuccess: () => invalidate(),
  })
}

export function useRecordValidation() {
  const invalidate = useInvalidateIndex()
  return useMutation({
    mutationFn: ({
      proposalId,
      ok,
      detail,
    }: {
      proposalId: string
      ok: boolean
      detail: string
    }) => api.recordValidation(proposalId, { ok, detail }),
    onSuccess: () => invalidate(),
  })
}

export const useSetPreference = () =>
  useMutation({
    mutationFn: (input: {
      scope: Scope
      statement: PreferenceStatement
      viewId?: string
      subjects?: string[]
      value?: string
      note?: string
    }) => api.setPreference(input),
  })

export function useWritePolicy() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (policy: IndexPolicy) => api.writePolicy(policy),
    onSuccess: (policy) => queryClient.setQueryData(keys.policy, policy),
  })
}

export function useCreateCollection() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (name: string) => api.createCollection(name),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: keys.collections }),
  })
}

/** Filing changes membership, so documents, bindings and collections refresh with it. */
function useInvalidateMaterial() {
  const queryClient = useQueryClient()
  return () =>
    queryClient.invalidateQueries({
      predicate: ({ queryKey }) =>
        queryKey[0] === INDEX[0] &&
        queryKey[1] === INDEX[1] &&
        ['collections', 'binding', 'document', 'filings'].includes(
          String(queryKey[2]),
        ),
    })
}

/**
 * Changes whenever a filing write in this page succeeds, in whatever order
 * they finish: it names every succeeded write, not the latest submitted. A
 * view's bindings run inside OpenUI's own query manager, which reads again
 * only when asked. (A write leaving the mutation cache changes it too, which
 * costs one extra read.)
 */
export const useMaterialChanged = () =>
  useMutationState({
    filters: { mutationKey: MATERIAL, status: 'success' },
    select: (mutation) => mutation.mutationId,
  }).join()

export function useFileDocument() {
  const invalidate = useInvalidateMaterial()
  return useMutation({
    mutationKey: MATERIAL,
    mutationFn: (input: {
      documentId: string
      revision: { position: number; contentDigest: string }
    }) => api.fileDocument(input.documentId, input.revision),
    onSuccess: () => invalidate(),
  })
}

export function useCorrectFiling() {
  const invalidate = useInvalidateMaterial()
  return useMutation({
    mutationKey: MATERIAL,
    mutationFn: (input: {
      receiptId: string
      destinationCollectionId: string
    }) => api.correctFiling(input.receiptId, input.destinationCollectionId),
    onSuccess: () => invalidate(),
  })
}

export function useUndoCorrection() {
  const invalidate = useInvalidateMaterial()
  return useMutation({
    mutationKey: MATERIAL,
    mutationFn: (correctionId: string) => api.undoCorrection(correctionId),
    onSuccess: () => invalidate(),
  })
}
