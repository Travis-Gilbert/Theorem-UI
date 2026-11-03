// SOURCING: the filesystem-item component the owner supplied (a recursive folder/file list: lucide ChevronRight, Folder and File; framer-motion for the chevron turn and the folder's height)
// Adapted: the chevron and child list are module-level components, so a render
// never remounts them and cuts AnimatePresence's exit short; the whole row is
// one button (a folder toggles, a file is chosen) with the tree's ARIA roles,
// levels and selection; a folder whose children are not read yet can still
// open (`lazy`) and says it is loading; colours are the app's tokens rather
// than gray and sky, which vanish in the dark palettes; motion stops when the
// person prefers reduced motion. FilesystemTree adds arrow-key movement.
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronRight, File, Folder, LoaderCircle } from 'lucide-react'
import { useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { cn } from '@/lib/utils'

export type FilesystemNode = {
  /** Stable identity, such as a path; the name when absent. */
  id?: string
  name: string
  /** Present for a folder, even an empty one; absent for a file. */
  nodes?: FilesystemNode[]
  /** A folder whose children have not been read: it can open and ask for them. */
  lazy?: boolean
  loading?: boolean
  /** Shown but not chosen, such as a file the server will not read. */
  disabled?: boolean
  title?: string
}

type ItemProps = {
  node: FilesystemNode
  animated?: boolean
  /** The chosen node's id; its row is marked selected. */
  selectedId?: string
  onSelect?: (node: FilesystemNode) => void
  /** A folder opened or closed; a lazy folder reads its children here. */
  onOpenChange?: (node: FilesystemNode, open: boolean) => void
  /** The row that holds the tree's one tab stop. */
  activeId?: string
  /** 1 at the root, for aria-level. */
  level?: number
}

const SPRING = { type: 'spring', bounce: 0, duration: 0.4 } as const

const idOf = (node: FilesystemNode) => node.id ?? node.name

function ChevronIcon({ open, animated }: { open: boolean; animated: boolean }) {
  return animated ? (
    <motion.span
      animate={{ rotate: open ? 90 : 0 }}
      transition={SPRING}
      className="flex"
    >
      <ChevronRight className="size-4 text-ink-faint" />
    </motion.span>
  ) : (
    <ChevronRight
      className={cn('size-4 text-ink-faint', open && 'rotate-90')}
    />
  )
}

function ChildrenList({
  open,
  animated,
  children,
}: {
  open: boolean
  animated: boolean
  children: ReactNode
}) {
  if (animated)
    return (
      <AnimatePresence initial={false}>
        {open && (
          <motion.ul
            role="group"
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={SPRING}
            className="flex flex-col justify-end overflow-hidden pl-6"
          >
            {children}
          </motion.ul>
        )}
      </AnimatePresence>
    )
  return open ? (
    <ul role="group" className="pl-6">
      {children}
    </ul>
  ) : null
}

function FilesystemTreeItem({
  node,
  animated = false,
  selectedId,
  onSelect,
  onOpenChange,
  activeId,
  level = 1,
}: ItemProps) {
  const [isOpen, setIsOpen] = useState(false)
  const reduce = useReducedMotion()
  const motionOn = animated && !reduce
  const folder = node.nodes !== undefined
  const expandable = folder && (node.lazy || (node.nodes?.length ?? 0) > 0)
  const selected = selectedId !== undefined && selectedId === idOf(node)

  const activate = () => {
    if (folder) {
      if (!expandable) return
      setIsOpen(!isOpen)
      onOpenChange?.(node, !isOpen)
    } else if (!node.disabled) onSelect?.(node)
  }

  return (
    <li role="none">
      <button
        type="button"
        role="treeitem"
        data-tree-row={idOf(node)}
        tabIndex={activeId === idOf(node) ? 0 : -1}
        aria-level={level}
        aria-expanded={expandable ? isOpen : undefined}
        aria-selected={folder ? undefined : selected}
        aria-disabled={node.disabled || undefined}
        title={node.title ?? node.name}
        onClick={activate}
        className={cn(
          'flex w-full items-center gap-1.5 rounded-md px-1.5 py-1 text-start text-sm text-ink transition-colors duration-100 outline-none',
          'hover:bg-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus',
          selected && 'bg-pill shadow-pill',
          node.disabled && 'text-ink-faint line-through',
        )}
      >
        {expandable && <ChevronIcon open={isOpen} animated={motionOn} />}
        {folder ? (
          <Folder
            aria-hidden
            className={cn(
              'size-5 shrink-0 fill-focus/20 text-focus',
              !expandable && 'ml-[22px]',
            )}
          />
        ) : (
          <File
            aria-hidden
            className="ml-[22px] size-5 shrink-0 text-ink-faint"
          />
        )}
        <span className="min-w-0 truncate">{node.name}</span>
        {node.loading && (
          <LoaderCircle
            aria-label="Loading"
            className="ms-auto size-3.5 shrink-0 animate-spin text-ink-faint motion-reduce:animate-none"
          />
        )}
      </button>

      {expandable && (
        <ChildrenList open={isOpen} animated={motionOn}>
          {node.nodes?.map((child) => (
            <FilesystemTreeItem
              key={idOf(child)}
              node={child}
              animated={animated}
              selectedId={selectedId}
              onSelect={onSelect}
              onOpenChange={onOpenChange}
              activeId={activeId}
              level={level + 1}
            />
          ))}
        </ChildrenList>
      )}
    </li>
  )
}

const rows = (tree: HTMLElement) => [
  ...tree.querySelectorAll<HTMLElement>('[data-tree-row]'),
]

/**
 * Arrow keys between rows, as a tree does: up and down move, right opens a
 * folder or steps into it, left closes it or steps out to its parent, Home and
 * End jump.
 */
function onTreeKeyDown(event: KeyboardEvent<HTMLUListElement>) {
  const tree = event.currentTarget
  const all = rows(tree)
  const row = (event.target as HTMLElement).closest<HTMLElement>(
    '[data-tree-row]',
  )
  const at = row ? all.indexOf(row) : -1
  const focus = (target: HTMLElement | undefined) => {
    if (!target) return
    event.preventDefault()
    target.focus()
  }
  switch (event.key) {
    case 'ArrowDown':
      return focus(all[Math.min(all.length - 1, at + 1)])
    case 'ArrowUp':
      return focus(all[Math.max(0, at - 1)])
    case 'Home':
      return focus(all[0])
    case 'End':
      return focus(all[all.length - 1])
    case 'ArrowRight':
      if (row?.getAttribute('aria-expanded') === 'false') {
        event.preventDefault()
        row.click()
      } else if (row?.getAttribute('aria-expanded') === 'true')
        focus(all[at + 1])
      return
    case 'ArrowLeft':
      if (row?.getAttribute('aria-expanded') === 'true') {
        event.preventDefault()
        row.click()
      } else
        focus(
          row
            ?.closest('[role=group]')
            ?.parentElement?.querySelector<HTMLElement>(
              ':scope > [data-tree-row]',
            ) ?? undefined,
        )
      return
  }
}

/**
 * A self-contained tree with arrow keys inside and one tab stop: the row
 * last focused, else the chosen one, else the first (a roving tabindex).
 */
export function FilesystemTree({
  nodes,
  label,
  className,
  ...item
}: Omit<ItemProps, 'node' | 'level' | 'activeId'> & {
  nodes: FilesystemNode[]
  label: string
  className?: string
}) {
  const [focused, setFocused] = useState<string>()
  const first = nodes[0] ? idOf(nodes[0]) : undefined
  return (
    <ul
      role="tree"
      aria-label={label}
      onKeyDown={onTreeKeyDown}
      onFocus={(event) => {
        const id = (event.target as HTMLElement).getAttribute('data-tree-row')
        if (id !== null) setFocused(id)
      }}
      className={cn('outline-none', className)}
    >
      {nodes.map((node) => (
        <FilesystemTreeItem
          key={idOf(node)}
          node={node}
          activeId={focused ?? item.selectedId ?? first}
          {...item}
        />
      ))}
    </ul>
  )
}
