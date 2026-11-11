// SOURCING: React context for what a page's components are told about where
// they render; zustand + zustand/middleware persist (per browser, as the
// shell's sizes and the module grants are) for the size a split was dragged
// to. The sash masks frames while it moves, as dockview's sash does, since a
// frame under the pointer would otherwise take the moves.
import type { PuckContext } from '@puckeditor/core'
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import type { KeyboardEvent, PointerEvent, ReactNode } from 'react'
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { cn } from '@/lib/utils'

/** What the page's components are told about where they render. */
export interface PageMetadata {
  /** The page is being arranged: nothing an instance sends leaves it. */
  arranging?: boolean
  /** The page file, so what this browser keeps for the page is its own. */
  page?: string
}

export const isArranging = (puck: PuckContext | undefined) =>
  !!puck &&
  (puck.isEditing || (puck.metadata as PageMetadata).arranging === true)

/**
 * How the page presents its instances, from its root settings. A page that
 * fills the window stretches its layout to the window's height; flush
 * instances drop their cards, so a page reads as one surface (Index and IDE
 * modes are pages like this).
 */
export interface PagePresentation {
  fill: boolean
  flush: boolean
}

export const PagePresentationContext = createContext<PagePresentation>({
  fill: false,
  flush: false,
})

export const usePagePresentation = () => useContext(PagePresentationContext)

/** Whether the instance sits in a split or a tab, where it fills its share. */
export const FillContext = createContext(false)

/**
 * One side of a split: which instances are in it, and which of them said they
 * have nothing to show. A split can fold a side where none has anything.
 */
interface Side {
  present: (path: string, here: boolean) => void
  empty: (path: string, empty: boolean) => void
}

export const SideContext = createContext<Side | null>(null)

const toggled = (set: ReadonlySet<string>, path: string, on: boolean) => {
  if (set.has(path) === on) return set
  const next = new Set(set)
  if (on) next.add(path)
  else next.delete(path)
  return next
}

/**
 * A side for a split to provide, and whether it has nothing to show. A split
 * nested in another split's side is part of that side too: what is placed in
 * its second side is also told to the side around it, as what is placed in
 * its first side already is (the first side provides no side of its own).
 */
function useSide(): [Side, boolean] {
  const around = useContext(SideContext)
  const [present, setPresent] = useState<ReadonlySet<string>>(new Set())
  const [empty, setEmpty] = useState<ReadonlySet<string>>(new Set())
  const side = useMemo<Side>(
    () => ({
      present: (path, here) => {
        setPresent((set) => toggled(set, path, here))
        around?.present(path, here)
      },
      empty: (path, isEmpty) => {
        setEmpty((set) => toggled(set, path, isEmpty))
        around?.empty(path, isEmpty)
      },
    }),
    [around],
  )
  return [side, [...present].every((path) => empty.has(path))]
}

/**
 * Says the instance at `path` is in the side around it, for as long as it is
 * placed. A composite's own parts belong to the composite, not the side, so
 * whoever calls this resets the side for its children.
 */
export function usePresentInSide(path: string): Side | null {
  const side = useContext(SideContext)
  useLayoutEffect(() => {
    if (!side) return
    side.present(path, true)
    return () => {
      side.present(path, false)
      side.empty(path, false)
    }
  }, [side, path])
  return side
}

/** How an instance reports that it has nothing to show. */
export const EmptyReportContext = createContext<(empty: boolean) => void>(
  () => {},
)

/**
 * For a module: says whether it has nothing to show right now, so a split set
 * to fold can hide its side (the Index's inspector, before an item is open).
 */
export function useNothingToShow(empty: boolean) {
  const report = useContext(EmptyReportContext)
  useLayoutEffect(() => {
    report(empty)
  }, [report, empty])
}

/** What a split was dragged to, per page and split, in this browser. */
const useSplitSizes = create<{
  sizes: Record<string, number>
  set: (key: string, size: number) => void
}>()(
  persist(
    (set) => ({
      sizes: {},
      set: (key, size) =>
        set(({ sizes }) => ({ sizes: { ...sizes, [key]: size } })),
    }),
    { name: 'theorem-ui:split-sizes' },
  ),
)

/**
 * A slot's content, as Puck hands it to a component. Call it rather than
 * mount it: Puck makes a new one each time a nested component renders, and as
 * an element type each new one would remount everything placed in the slot.
 */
type SlotRender = (props?: { className?: string }) => ReactNode

/** Each child takes an equal share of the slot's height. */
const FILL_SLOT =
  'flex size-full min-h-0 min-w-0 flex-col [&>*]:min-h-0 [&>*]:flex-1'

export type SplitFixed = 'none' | 'first' | 'second'

export interface SplitProps {
  id: string
  direction: 'row' | 'column'
  /** The first side's share, when neither side has a fixed size. */
  ratio: number
  height: number
  /** A side that keeps its size while the other takes the rest. */
  fixed?: SplitFixed
  /** The fixed side's size, in pixels. */
  size?: number
  /** Hide the second side while nothing in it has anything to show. */
  fold?: boolean
  first: SlotRender
  second: SlotRender
  puck?: PuckContext
}

/** Neither side is dragged smaller than this. */
const MIN_SIDE = 120

const clamp = (value: number, low: number, high: number) =>
  Math.min(high, Math.max(low, value))

/**
 * Two sides, side by side or stacked. In use the line between them can be
 * dragged; what it is dragged to is kept in this browser, not in the page.
 */
export function Split(props: SplitProps) {
  const { fill, flush } = usePagePresentation()
  const arranging = isArranging(props.puck)
  const row = props.direction !== 'column'
  const fixed: SplitFixed = props.fixed ?? 'none'
  const page = (props.puck?.metadata as PageMetadata | undefined)?.page ?? ''
  const key = `${page}#${props.id}#${fixed}`
  const dragged = useSplitSizes((s) => s.sizes[key])
  const setDragged = useSplitSizes((s) => s.set)
  const [side, nothingSecond] = useSide()
  const [moving, setMoving] = useState(false)
  const box = useRef<HTMLDivElement>(null)

  const share = clamp(Number(dragged ?? props.ratio) || 50, 10, 90)
  const size = Math.max(MIN_SIDE, Number(dragged ?? props.size) || 400)
  const folded = !arranging && !!props.fold && nothingSecond
  const height = fill
    ? undefined
    : { height: Math.max(160, Number(props.height) || 560) }

  if (arranging) {
    const tracks =
      fixed === 'first'
        ? `${size}px minmax(0, 1fr)`
        : fixed === 'second'
          ? `minmax(0, 1fr) ${size}px`
          : `minmax(0, ${share}fr) minmax(0, ${100 - share}fr)`
    return (
      <FillContext.Provider value>
        <div
          className={cn('grid gap-3', fill && 'h-full min-h-[400px]')}
          style={{
            ...height,
            ...(row
              ? { gridTemplateColumns: tracks }
              : { gridTemplateRows: tracks }),
          }}
        >
          {props.first({ className: cn(FILL_SLOT, 'gap-3') })}
          <SideContext.Provider value={side}>
            {props.second({ className: cn(FILL_SLOT, 'gap-3') })}
          </SideContext.Provider>
        </div>
      </FillContext.Provider>
    )
  }

  const flex = (which: 'first' | 'second') => {
    if (fixed === which) return `0 0 ${size}px`
    if (fixed !== 'none') return '1 1 0'
    return `${which === 'first' ? share : 100 - share} 1 0`
  }

  const total = () => {
    const rect = box.current?.getBoundingClientRect()
    return rect ? (row ? rect.width : rect.height) : 0
  }
  const resize = (offset: number) => {
    const length = total()
    if (!length) return
    if (fixed === 'none')
      setDragged(key, clamp((offset / length) * 100, 10, 90))
    else {
      const next = fixed === 'first' ? offset : length - offset
      setDragged(key, Math.round(clamp(next, MIN_SIDE, length - MIN_SIDE)))
    }
  }
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    event.preventDefault()
    event.currentTarget.setPointerCapture(event.pointerId)
    setMoving(true)
  }
  const onPointerMove = (event: PointerEvent<HTMLDivElement>) => {
    if (!moving) return
    const rect = box.current?.getBoundingClientRect()
    if (!rect) return
    resize(row ? event.clientX - rect.left : event.clientY - rect.top)
  }
  const onPointerUp = (event: PointerEvent<HTMLDivElement>) => {
    event.currentTarget.releasePointerCapture(event.pointerId)
    setMoving(false)
  }
  const firstLength = () => {
    const length = total()
    if (fixed === 'first') return size
    if (fixed === 'second') return length - size
    return (share / 100) * length
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const back = row ? 'ArrowLeft' : 'ArrowUp'
    const forth = row ? 'ArrowRight' : 'ArrowDown'
    if (event.key !== back && event.key !== forth) return
    event.preventDefault()
    resize(firstLength() + (event.key === forth ? 24 : -24))
  }

  return (
    <FillContext.Provider value>
      <div
        ref={box}
        data-split={props.id}
        className={cn(
          'flex min-h-0 min-w-0',
          row ? 'flex-row' : 'flex-col',
          fill && 'h-full',
          !flush && 'gap-1',
          moving && 'select-none [&_iframe]:pointer-events-none',
        )}
        style={height}
      >
        <div
          className="flex min-h-0 min-w-0"
          style={{ flex: folded ? '1 1 0' : flex('first') }}
        >
          {props.first({ className: cn(FILL_SLOT, !flush && 'gap-3') })}
        </div>
        <div
          role="separator"
          aria-orientation={row ? 'vertical' : 'horizontal'}
          aria-label="Resize"
          tabIndex={0}
          hidden={folded}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onKeyDown={onKeyDown}
          className={cn(
            'relative shrink-0 touch-none outline-none focus-visible:bg-ring/50',
            row ? 'cursor-col-resize' : 'cursor-row-resize',
            flush
              ? cn('bg-separator', row ? 'w-px' : 'h-px')
              : cn('rounded-full hover:bg-hover', row ? 'w-2' : 'h-2'),
            // A wider grip than the line it draws.
            row
              ? 'after:absolute after:inset-y-0 after:-inset-x-1'
              : 'after:absolute after:inset-x-0 after:-inset-y-1',
            moving && 'bg-ring/50',
          )}
        />
        <div
          className="flex min-h-0 min-w-0"
          hidden={folded}
          style={{ flex: flex('second') }}
        >
          <SideContext.Provider value={side}>
            {props.second({ className: cn(FILL_SLOT, !flush && 'gap-3') })}
          </SideContext.Provider>
        </div>
      </div>
    </FillContext.Provider>
  )
}

/** The root's class: a page that fills the window stretches what it holds. */
export function rootClass({ fill, flush }: PagePresentation) {
  return cn(
    'flex flex-col',
    fill
      ? 'h-full min-h-0 [&>div]:flex [&>div]:min-h-0 [&>div]:flex-1 [&>div]:flex-col [&>div>*]:min-h-0 [&>div>*]:flex-1'
      : 'min-h-full',
    !flush && 'gap-3 p-3 [&>div]:gap-3',
  )
}
