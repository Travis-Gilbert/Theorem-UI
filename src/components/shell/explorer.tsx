// SOURCING: @headless-tree/react + @headless-tree/core (tree state, async child loading, keyboard navigation and ARIA), @tanstack/react-query via lib/theorem/project-files (the cached root, children and content reads)
import {
  asyncDataLoaderFeature,
  hotkeysCoreFeature,
  selectionFeature,
} from '@headless-tree/core'
import { useTree } from '@headless-tree/react'
import { useQueryClient } from '@tanstack/react-query'
import { useRef } from 'react'
import { describeError } from '@/lib/theorem/client'
import {
  fileChildrenQuery,
  fileRootQuery,
  isUnconfigured,
  useFileDock,
  useFileRoot,
} from '@/lib/theorem/project-files'
import type { FileEntry } from '@/lib/theorem/project-files'
import { useActiveProject } from './projects'
import { useShell } from './shell-state'

/** The tree's own root id; the project root's real path can be empty. */
const ROOT = '\u0000root'

const LOADING: FileEntry = {
  entryId: '',
  name: '…',
  kind: 'file',
  path: '',
  children: [],
  loaded: false,
  refusal: null,
}

function FileTree({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient()
  // Entries seen so far by path, so a folder the server sent with its children
  // already loaded opens without another request.
  const entries = useRef(new Map<string, FileEntry>())

  const childrenOf = async (entry: FileEntry) => {
    const list = entry.loaded
      ? entry.children
      : await queryClient.fetchQuery(fileChildrenQuery(projectId, entry.path))
    for (const child of list) entries.current.set(child.path, child)
    return list.map((child) => ({ id: child.path, data: child }))
  }

  const tree = useTree<FileEntry>({
    rootItemId: ROOT,
    getItemName: (item) => item.getItemData().name,
    isItemFolder: (item) => item.getItemData().kind !== 'file',
    createLoadingItemData: () => LOADING,
    onPrimaryAction: (item) => {
      const entry = item.getItemData()
      if (entry.kind === 'file' && !entry.refusal)
        useFileDock.getState().open?.(entry.path)
    },
    dataLoader: {
      getItem: async (id) => {
        if (id === ROOT)
          return (await queryClient.fetchQuery(fileRootQuery(projectId))).root
        return entries.current.get(id) ?? LOADING
      },
      getChildrenWithData: async (id) => {
        const entry =
          id === ROOT
            ? (await queryClient.fetchQuery(fileRootQuery(projectId))).root
            : entries.current.get(id)
        return entry ? childrenOf(entry) : []
      },
    },
    features: [asyncDataLoaderFeature, selectionFeature, hotkeysCoreFeature],
  })

  return (
    <div
      {...tree.getContainerProps('Project files')}
      className="flex flex-col py-1 outline-none"
    >
      {tree.getItems().map((item) => {
        const entry = item.getItemData()
        const folder = item.isFolder()
        const { level } = item.getItemMeta()
        return (
          <button
            {...item.getProps()}
            key={item.getId()}
            type="button"
            title={entry.refusal ?? entry.path}
            className="flex h-[22px] w-full shrink-0 items-stretch pe-2 ps-2 text-start whitespace-nowrap text-term-ink outline-none hover:bg-term-raised focus-visible:bg-term-raised aria-selected:bg-term-raised aria-selected:text-term-bright"
          >
            {Array.from({ length: level }, (_, depth) => (
              <span
                key={depth}
                aria-hidden="true"
                className="ms-[5px] w-[9px] shrink-0 border-s border-term-line"
              />
            ))}
            <span
              aria-hidden="true"
              className="flex w-3.5 shrink-0 items-center text-term-muted"
            >
              {folder ? (item.isExpanded() ? '▾' : '▸') : ''}
            </span>
            <span
              className={`flex min-w-0 items-center truncate ${
                entry.refusal
                  ? 'text-term-muted line-through'
                  : folder
                    ? 'text-term-sage'
                    : ''
              }`}
            >
              {entry.name}
              {folder && '/'}
            </span>
            {item.isLoading() && (
              <span className="ms-1.5 flex items-center text-term-muted">
                …
              </span>
            )}
          </button>
        )
      })}
    </div>
  )
}

/** The root's state: the tree once it reads, else why it does not. */
function ExplorerBody({ projectId }: { projectId: string }) {
  const root = useFileRoot(projectId)
  if (root.isPending)
    return <p className="px-3 py-2 text-term-muted">reading files…</p>
  if (root.error)
    return isUnconfigured(root.error) ? (
      <p className="px-3 py-2 leading-relaxed text-term-muted">
        No folder is bound to this server. Start it with
        <span className="text-term-gold"> THEOREMWEB_PROJECT_ROOT</span> and
        <span className="text-term-gold"> THEOREMWEB_PROJECT_ID</span>.
      </p>
    ) : (
      <p className="px-3 py-2 leading-relaxed text-term-error">
        {describeError(root.error)}
      </p>
    )
  return <FileTree key={projectId} projectId={projectId} />
}

/**
 * The project's files under the chats, styled as pi's terminal side panel: a
 * fixed dark slate in every palette, mono type and guide rules for depth.
 * Choosing a file opens it as a panel in the dock.
 */
export function Explorer() {
  const { project } = useActiveProject()
  const open = useShell((s) => s.explorerOpen)
  const toggle = useShell((s) => s.toggleExplorer)
  const root = useFileRoot(project?.projectId)
  const name = root.data?.root.name

  return (
    <section
      aria-label="Explorer"
      className={`mx-2 mb-2 flex min-h-0 flex-col overflow-hidden rounded-lg bg-term font-mono text-xs ${
        open ? 'max-h-[50%] shrink' : 'shrink-0'
      }`}
    >
      <button
        type="button"
        aria-expanded={open}
        onClick={toggle}
        className="flex h-8 shrink-0 items-center gap-1.5 px-2.5 text-[11px] tracking-[0.08em] text-term-muted uppercase outline-none hover:text-term-ink focus-visible:text-term-bright"
      >
        <span aria-hidden="true" className="w-2.5">
          {open ? '▾' : '▸'}
        </span>
        Explorer
        {name && (
          <span className="min-w-0 truncate tracking-normal text-term-sage normal-case">
            {name}
          </span>
        )}
      </button>
      {open && project && (
        <div className="min-h-0 flex-1 overflow-auto border-t border-term-line">
          <ExplorerBody projectId={project.projectId} />
        </div>
      )}
    </section>
  )
}
