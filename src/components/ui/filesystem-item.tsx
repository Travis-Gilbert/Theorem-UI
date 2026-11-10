// SOURCING: the filesystem-item component supplied for the file tree (a
// spring-turned lucide chevron, a filled folder, and a subtree whose height
// framer-motion's AnimatePresence opens and closes), made controlled: the
// tree that uses it (@headless-tree in workspace-tree.tsx) owns which folders
// are open, focus, selection, renaming and the row itself. Its chevron and
// subtree were components made in render, which remounted them each time and
// cut their animations short; here they are plain elements.
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion'
import { ChevronRight, File, Folder } from 'lucide-react'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const spring = { type: 'spring', bounce: 0, duration: 0.4 } as const

/** Reduced motion keeps the change and drops the movement. */
const useSpring = () => (useReducedMotion() ? { duration: 0 } : spring)

/**
 * A row's chevron and icon. A folder's chevron turns as it opens; an empty
 * folder and a file keep its place, so names line up. `icon` stands in for
 * the folder's or the file's own.
 */
export function FilesystemMarks({
  folder,
  open,
  empty = false,
  icon,
}: {
  folder: boolean
  open: boolean
  empty?: boolean
  icon?: ReactNode
}) {
  const transition = useSpring()
  return (
    <>
      <motion.span
        aria-hidden="true"
        animate={{ rotate: open ? 90 : 0 }}
        transition={transition}
        className={cn('flex shrink-0', (!folder || empty) && 'invisible')}
      >
        <ChevronRight className="size-4 text-ink-faint" />
      </motion.span>
      {icon ??
        (folder ? (
          <Folder
            aria-hidden="true"
            className="size-4 shrink-0 fill-folder text-folder"
          />
        ) : (
          <File aria-hidden="true" className="size-4 shrink-0 text-ink-muted" />
        ))}
    </>
  )
}

/**
 * One entry of the tree: its row, and under an open folder its entries,
 * which slide open and closed.
 */
export function FilesystemItem({
  row,
  open,
  children,
}: {
  row: ReactNode
  open: boolean
  children?: ReactNode
}) {
  const transition = useSpring()
  return (
    <div className="flex flex-col">
      {row}
      <AnimatePresence initial={false}>
        {open && children && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            transition={transition}
            className="flex flex-col justify-end overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
