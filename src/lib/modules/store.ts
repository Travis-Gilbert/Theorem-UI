// SOURCING: the Theorem vault's WorkspaceClient over the SDK Files API
// (theorem-files/1, src/lib/workspace/theorem-client.ts): pages and modules
// are files there, written with If-Match so a change made elsewhere is never
// overwritten. @tanstack/react-query holds what was read, the workspace
// tree's event-fed cache (useWorkspaceTree) says when to read it again.
import {
  useMutation,
  useQueries,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { isTheoremWorkspace } from '@/lib/workspace/theorem-client'
import type { WorkspaceClient, WorkspaceEntry } from '@/lib/workspace/types'
import {
  useWorkspaceTree,
  useWorkspaces,
  workspaceClient,
  workspaceTreeKey,
} from '@/lib/workspace/workspaces'
import type { ModuleManifest, PageDocument } from './contract'
import {
  MODULE_SCHEMA,
  ModuleFileError,
  PAGE_SUFFIX,
  manifestText,
  pageText,
  parseManifest,
  parsePage,
} from './contract'
import { moduleDigest } from './grants'
import { fromManifest, setInstalled } from './registry'
import type { ModuleDefinition } from './registry'
import {
  TEMPLATES_FOLDER,
  isModePagePath,
  isTemplatePath,
  modePagePath,
  modeTemplatePage,
  pageFromTemplate,
} from './templates'
import type { PageMode, PageTemplate } from './templates'

export const PAGES_FOLDER = 'Pages'
export const MODULES_FOLDER = 'Modules'
export { PAGE_SUFFIX }
export const MANIFEST_NAME = 'module.json'

export const isPagePath = (path: string) =>
  path.startsWith(`${PAGES_FOLDER}/`) && path.endsWith(PAGE_SUFFIX)

/** `Modules/<folder>/module.json`, one folder deep. */
export const isManifestPath = (path: string) => {
  const parts = path.split('/')
  return (
    parts.length === 3 &&
    parts[0] === MODULES_FOLDER &&
    parts[2] === MANIFEST_NAME &&
    !parts[1]!.startsWith('.')
  )
}

/** A file name for `title`: what a person can read, nothing a path forbids. */
export function fileStem(title: string): string {
  const stem = title
    .replace(/[\\/:*?"<>|#^[\]\p{Cc}]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
  return stem || 'Untitled'
}

/** The first free path for `stem`: `Pages/Desk.page.json`, then `Desk 2`. */
export function freePath(
  taken: ReadonlySet<string>,
  folder: string,
  stem: string,
  suffix: string,
): string {
  for (let n = 1; ; n++) {
    const path = `${folder}/${n === 1 ? stem : `${stem} ${n}`}${suffix}`
    if (!taken.has(path)) return path
  }
}

/** The Theorem vault's client, once the vault is known. */
export function useVaultClient(): {
  client: WorkspaceClient | undefined
  isPending: boolean
} {
  const { workspaces, isPending } = useWorkspaces()
  const vault = workspaces.find(isTheoremWorkspace)
  return { client: vault && workspaceClient(vault), isPending }
}

const pageKey = (workspaceId: string, path: string) =>
  ['modules', 'page', workspaceId, path] as const
const manifestKey = (workspaceId: string, path: string) =>
  ['modules', 'manifest', workspaceId, path] as const

const modeKey = (workspaceId: string, path: string) =>
  ['modules', 'mode', workspaceId, path] as const

/** A mode's file as read: its page, or why it is not one. */
type ModeRead = { page?: PageDocument; hash: string; problem?: string }

/**
 * Reads a file's query again when the file changes in the vault, by its own
 * events: a rename follows the entry, a change or a new file refetches.
 */
function useRefetchOnChange(
  client: WorkspaceClient,
  key: (path: string) => readonly unknown[],
  matches: (path: string) => boolean,
) {
  const queryClient = useQueryClient()
  useEffect(
    () =>
      client.subscribe((event) => {
        if (event.type === 'resync')
          void queryClient.invalidateQueries({ queryKey: ['modules'] })
        // A file made where one was before is read again, not taken from
        // what was read of the one before it.
        else if (
          (event.type === 'changed' || event.type === 'created') &&
          matches(event.entry.path)
        )
          void queryClient.invalidateQueries({
            queryKey: key(event.entry.path),
          })
      }),
    [client, queryClient, key, matches],
  )
}

export interface LoadedPage {
  path: string
  entry: WorkspaceEntry
  page: PageDocument
  hash: string
}

export interface PageListing {
  entry: WorkspaceEntry
  page?: PageDocument
  error?: string
}

/** Every page file `matches` takes, read so a list can show titles and pins. */
function usePageFiles(
  client: WorkspaceClient,
  matches: (path: string) => boolean,
) {
  const tree = useWorkspaceTree(client)
  const entries = useMemo(
    () =>
      (tree.data ?? [])
        .filter((e) => e.kind === 'file' && matches(e.path))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [tree.data, matches],
  )
  const key = useMemo(
    () => (path: string) => pageKey(client.workspace.id, path),
    [client],
  )
  useRefetchOnChange(client, key, matches)
  return useQueries({
    queries: entries.map((entry) => ({
      queryKey: key(entry.path),
      queryFn: () => readPage(client, entry.path),
      staleTime: Infinity,
    })),
    combine: (results) => ({
      isPending: tree.isPending,
      pages: entries.map((entry, i): PageListing => ({
        entry,
        page: results[i]?.data?.page,
        error: results[i]?.error ? String(results[i].error.message) : undefined,
      })),
    }),
  })
}

/** Every page in the vault, read so the list can show titles and pins. */
export const usePages = (client: WorkspaceClient) =>
  usePageFiles(client, isPagePath)

/** The templates saved to the vault's Templates folder, those that parse. */
export function useVaultTemplates(client: WorkspaceClient): {
  isPending: boolean
  templates: PageTemplate[]
} {
  const { isPending, pages } = usePageFiles(client, isTemplatePath)
  return {
    isPending,
    templates: pages.flatMap(({ entry, page }) =>
      page
        ? [
            {
              id: entry.path,
              title: page.title,
              origin: 'vault' as const,
              layout: page.layout,
            },
          ]
        : [],
    ),
  }
}

async function readPage(client: WorkspaceClient, path: string) {
  const { text, hash } = await client.readText(path)
  return { page: parsePage(path, text), hash }
}

/**
 * One page by its vault entry id, which a rename keeps. `data` is the file
 * as it is now; the page view decides what to show (see useHeldPage).
 */
export function usePage(client: WorkspaceClient, entryId: string) {
  const tree = useWorkspaceTree(client)
  const entry = tree.data?.find((e) => e.id === entryId)
  const key = useMemo(
    () => (path: string) => pageKey(client.workspace.id, path),
    [client],
  )
  useRefetchOnChange(client, key, isPagePath)
  // The same key and shape as the page list's, so either fills it for both.
  const query = useQuery({
    queryKey: key(entry?.path ?? ''),
    queryFn: () => readPage(client, entry!.path),
    enabled: !!entry,
    staleTime: Infinity,
    retry: false,
  })
  const { refetch } = query
  const data = useMemo(
    (): LoadedPage | undefined =>
      entry && query.data
        ? { path: entry.path, entry, ...query.data }
        : undefined,
    [entry, query.data],
  )
  const reload = useCallback(async () => {
    const result = await refetch()
    return {
      data:
        entry && result.data
          ? { path: entry.path, entry, ...result.data }
          : undefined,
    }
  }, [refetch, entry])
  return {
    data,
    error: query.error,
    reload,
    /** The tree is in and has no such entry. */
    missing: !!tree.data && !entry,
    isPending: tree.isPending || (!!entry && query.isPending),
  }
}

/** Writes `page` to the first free name for its title in `folder`, never over a file. */
async function writeNew(
  client: WorkspaceClient,
  folder: string,
  page: PageDocument,
) {
  const entries = await client.tree()
  const path = freePath(
    new Set(entries.map((e) => e.path)),
    folder,
    fileStem(page.title),
    PAGE_SUFFIX,
  )
  await client.write(path, pageText(page), { expectedHash: null })
  return path
}

/** A new page, blank or from a template, in the Pages folder. */
export function useCreatePage(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      title,
      template,
    }: {
      title: string
      template?: Pick<PageTemplate, 'layout'>
    }) => {
      const page = pageFromTemplate(template, title.trim() || 'Untitled')
      const path = await writeNew(client, PAGES_FOLDER, page)
      const created = (await client.tree()).find((e) => e.path === path)
      await queryClient.invalidateQueries({
        queryKey: workspaceTreeKey(client.workspace.id),
      })
      if (!created) throw new Error(`${path} was written but is not listed`)
      return created
    },
  })
}

/** A page's layout saved to the Templates folder, under its own title. */
export function useSaveTemplate(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (page: PageDocument) => {
      const path = await writeNew(client, TEMPLATES_FOLDER, {
        ...page,
        pinned: false,
      })
      await queryClient.invalidateQueries({
        queryKey: workspaceTreeKey(client.workspace.id),
      })
      return path
    },
  })
}

/**
 * What this window made of each page file: the hashes it wrote, and '' for a
 * removal. A mode shows its own arrangement saved (or reset) from Pages at
 * once, where one written elsewhere waits behind Show it.
 */
const writtenHere = new Map<string, Set<string>>()
const noteWritten = (path: string, hash: string | null) => {
  const mine = writtenHere.get(path) ?? new Set<string>()
  writtenHere.set(path, mine.add(hash ?? ''))
}
export const wroteHere = (path: string, hash: string | null) =>
  writtenHere.get(path)?.has(hash ?? '') ?? false

/**
 * Saves a page over the revision it was read at. A change made since comes
 * back as WorkspaceConflictError; nothing is overwritten.
 */
export function useSavePage(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      path,
      page,
      hash,
    }: {
      path: string
      page: PageDocument
      /**
       * The hash the edit started from; `null` when it started from no file
       * (so one written since is a conflict); undefined to overwrite.
       */
      hash?: string | null
    }) => {
      const written = await client.write(path, pageText(page), {
        ...(hash !== undefined && { expectedHash: hash }),
      })
      // A merging store keeps something other than what was sent.
      const stored = written.merged
        ? await readPage(client, path)
        : { page, hash: written.hash }
      noteWritten(path, stored.hash)
      queryClient.setQueryData(pageKey(client.workspace.id, path), stored)
      // A mode reads its page under its own key. Its first save makes the
      // file, and the mode would otherwise wait on a read of what it wrote.
      if (isModePagePath(path))
        queryClient.setQueryData<ModeRead>(
          modeKey(client.workspace.id, path),
          stored,
        )
      return stored
    },
  })
}

/**
 * A mode's page: the vault's `Modes/<mode>.page.json`, else the template.
 * A file that does not parse shows the template and says why; a save then
 * replaces that file, and only that revision of it.
 */
export interface ModePageSource {
  path: string
  page: PageDocument
  /** The file's hash; null while there is no file. */
  hash: string | null
  /** The page is the template, not a file in the vault. */
  template: boolean
  problem?: string
}

export function useModePage(client: WorkspaceClient, mode: PageMode) {
  const path = modePagePath(mode)
  const tree = useWorkspaceTree(client)
  const entry = tree.data?.find((e) => e.path === path && e.kind === 'file')
  const key = useCallback(
    (at: string) => modeKey(client.workspace.id, at),
    [client],
  )
  const matches = useCallback((at: string) => at === path, [path])
  useRefetchOnChange(client, key, matches)
  const query = useQuery({
    queryKey: key(path),
    queryFn: async (): Promise<ModeRead> => {
      const { text, hash } = await client.readText(path)
      try {
        return { page: parsePage(path, text), hash }
      } catch (error) {
        return { hash, problem: (error as Error).message }
      }
    },
    enabled: !!entry,
    staleTime: Infinity,
    retry: false,
  })
  const { refetch } = query
  const sourceOf = useCallback(
    (data: ModeRead | undefined): ModePageSource | undefined => {
      if (!entry)
        return {
          path,
          page: modeTemplatePage(mode),
          hash: null,
          template: true,
        }
      if (!data) return undefined
      return data.page
        ? { path, page: data.page, hash: data.hash, template: false }
        : {
            path,
            page: modeTemplatePage(mode),
            hash: data.hash,
            template: true,
            problem: data.problem,
          }
    },
    [entry, path, mode],
  )
  const data = useMemo(
    () => (tree.data ? sourceOf(query.data) : undefined),
    [tree.data, sourceOf, query.data],
  )
  const reload = useCallback(async () => {
    if (!entry) return { data: sourceOf(undefined) }
    return { data: sourceOf((await refetch()).data) }
  }, [entry, refetch, sourceOf])
  // While a file that has just appeared is read (one written elsewhere), the
  // mode keeps what it had, so an editor over it stays where it was.
  const [last, setLast] = useState(data)
  if (data && data !== last) setLast(data)
  return {
    data: data ?? (last?.path === path ? last : undefined),
    error: query.error,
    reload,
    isPending: tree.isPending || (!!entry && query.isPending),
  }
}

/** Removes a mode's page, so the mode shows its template again. */
export function useResetModePage(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async (mode: PageMode) => {
      const path = modePagePath(mode)
      await client.remove(path)
      noteWritten(path, null)
      await queryClient.invalidateQueries({
        queryKey: workspaceTreeKey(client.workspace.id),
      })
      // Once the tree no longer has the file, what was read of it goes too.
      queryClient.removeQueries({
        queryKey: modeKey(client.workspace.id, path),
      })
    },
  })
}

/** Reads every module in the vault into the catalog, again on each change. */
export function useInstalledModules(client: WorkspaceClient) {
  const tree = useWorkspaceTree(client)
  const entries = useMemo(
    () =>
      (tree.data ?? [])
        .filter((e) => e.kind === 'file' && isManifestPath(e.path))
        .sort((a, b) => a.path.localeCompare(b.path)),
    [tree.data],
  )
  const key = useMemo(
    () => (path: string) => manifestKey(client.workspace.id, path),
    [client],
  )
  useRefetchOnChange(client, key, isManifestPath)
  const results = useQueries({
    queries: entries.map((entry) => ({
      queryKey: key(entry.path),
      queryFn: async () =>
        parseManifest(entry.path, (await client.readText(entry.path)).text),
      staleTime: Infinity,
      retry: false,
    })),
  })
  const settled = results.every((r) => !r.isPending)
  const signature = results
    .map((r) => `${r.dataUpdatedAt}:${r.errorUpdatedAt}`)
    .join(' ')
  useEffect(() => {
    if (!settled) return
    const installed: ModuleDefinition[] = []
    const problems: Array<{ path: string; message: string }> = []
    results.forEach((result, i) => {
      const path = entries[i]!.path
      if (result.data) installed.push(fromManifest(result.data, path))
      else
        problems.push({
          path,
          message:
            result.error instanceof ModuleFileError
              ? result.error.message
              : `${path}: ${result.error.message}`,
        })
    })
    setInstalled(installed, problems)
    // `signature` changes exactly when a result does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settled, signature, entries])
  // Pending only until the first full read. A manifest that arrives later
  // (a module saved from a page, or written by an agent) joins the catalog
  // without making the catalog pending again: an open page would otherwise
  // be swapped for its loading state and lose what was being arranged.
  const [read, setRead] = useState(false)
  if (!read && !tree.isPending && settled) setRead(true)
  return { isPending: !read }
}

/** A sandboxed module's files, read together, as its frame will run them. */
export interface ModuleFiles {
  manifest: ModuleManifest
  source: string
  /** Of the manifest's and the page's text: a grant is for these exactly. */
  digest: string
}

/**
 * The manifest and page of the sandboxed module in `folder`, read again when
 * anything in the folder changes, so what runs is what was granted.
 */
export function useModuleFiles(
  client: WorkspaceClient,
  folder: string,
  entry: string,
) {
  const queryClient = useQueryClient()
  const key = useMemo(
    () => ['modules', 'files', client.workspace.id, folder, entry] as const,
    [client, folder, entry],
  )
  useEffect(
    () =>
      client.subscribe((event) => {
        const touched =
          event.type === 'resync' ||
          ((event.type === 'changed' || event.type === 'created') &&
            event.entry.path.startsWith(`${folder}/`)) ||
          (event.type === 'deleted' && event.path.startsWith(`${folder}/`)) ||
          (event.type === 'renamed' &&
            (event.from.startsWith(`${folder}/`) ||
              event.to.startsWith(`${folder}/`)))
        if (touched) void queryClient.invalidateQueries({ queryKey: key })
      }),
    [client, folder, queryClient, key],
  )
  return useQuery({
    queryKey: key,
    queryFn: async (): Promise<ModuleFiles> => {
      const manifestPath = `${folder}/${MANIFEST_NAME}`
      const [manifest, source] = await Promise.all([
        client.readText(manifestPath),
        client.readText(`${folder}/${entry}`),
      ])
      return {
        manifest: parseManifest(manifestPath, manifest.text),
        source: source.text,
        digest: await moduleDigest(manifest.text, source.text),
      }
    },
    staleTime: Infinity,
    retry: false,
  })
}

/** The starting files of a new sandboxed module: its manifest and its page. */
export function newModuleFiles(id: string, label: string) {
  const manifest: ModuleManifest = {
    schema: MODULE_SCHEMA,
    id,
    version: 1,
    label,
    description: 'Shows the item it is given, and sends it on when asked.',
    settings: [
      { name: 'greeting', label: 'Greeting', kind: 'text', default: 'Hello' },
    ],
    inputs: [{ name: 'item', label: 'Item', type: 'item' }],
    outputs: [{ name: 'note', label: 'Note', type: 'text' }],
    events: [{ name: 'ask', label: 'Ask about it', type: 'item' }],
    actions: [],
    capabilities: { read: [], write: [], state: [], net: [] },
    migrations: [],
    implementation: { kind: 'sandboxed-html', entry: 'index.html' },
  }
  return { manifest: manifestText(manifest), html: STARTER_HTML }
}

const STARTER_HTML = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Module</title></head>
<body>
  <p id="greeting"></p>
  <p>Item: <strong id="item">nothing yet</strong></p>
  <label>Note <input id="note" placeholder="Type a note"></label>
  <button id="ask" type="button">Ask about it</button>
  <script>
    const module = window.theorem.module
    let item
    module.onInputs(({ inputs, settings }) => {
      document.getElementById('greeting').textContent = settings.greeting ?? ''
      item = inputs.item
      document.getElementById('item').textContent = item ? (item.label ?? item.id) : 'nothing yet'
    })
    document.getElementById('note').addEventListener('input', (event) => {
      module.output('note', event.target.value)
    })
    document.getElementById('ask').addEventListener('click', () => {
      if (item) module.emit('ask', item)
    })
  </script>
</body>
</html>
`

const slug = (label: string) => {
  const words = fileStem(label)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return /^[a-z]/.test(words) ? words : `module-${words}`.replace(/-$/, '')
}

/** An id for a new vault module that no module in `taken` has. */
export function newModuleId(label: string, taken: ReadonlySet<string>) {
  const base = `vault.${slug(label)}`
  let id = base
  for (let n = 2; taken.has(id); n++) id = `${base}-${n}`
  return id
}

/**
 * Writes a new module's folder: `Modules/<name>/module.json`, and its
 * `index.html` for a sandboxed one. The manifest is written last, so the
 * catalog never lists a module whose page is not there yet.
 */
export function useCreateModule(client: WorkspaceClient) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async ({
      label,
      id,
      manifest,
      html,
    }: {
      label: string
      id: string
      /** A composite's manifest; a sandboxed starter when absent. */
      manifest?: ModuleManifest
      html?: string
    }) => {
      const entries = await client.tree()
      const taken = new Set(entries.map((e) => e.path))
      const stem = slug(label)
      let folder = `${MODULES_FOLDER}/${stem}`
      for (let n = 2; taken.has(folder); n++)
        folder = `${MODULES_FOLDER}/${stem}-${n}`
      const files = manifest
        ? { manifest: manifestText({ ...manifest, id }), html }
        : newModuleFiles(id, label)
      if (files.html !== undefined)
        await client.write(`${folder}/index.html`, files.html, {
          expectedHash: null,
        })
      const path = `${folder}/${MANIFEST_NAME}`
      await client.write(path, files.manifest, { expectedHash: null })
      await queryClient.invalidateQueries({
        queryKey: workspaceTreeKey(client.workspace.id),
      })
      return { id, folder, path }
    },
  })
}
