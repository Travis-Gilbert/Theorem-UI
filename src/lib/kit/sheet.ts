// SOURCING: the Aseprite sprite-sheet JSON export (array frames, meta.frameTags with from/to, per-frame duration), read as Aseprite writes it; src/assets/kit holds the sheet, its export and its .aseprite source
import exported from '@/assets/kit/kit.json'
import type { Pose } from './liveness'

/** Kit's body animations beside the poses: tags the figure plays on its own. */
export type BodyTag =
  'walk' | 'run' | 'crouch' | 'air' | 'fall' | 'held' | 'peek' | 'sleep'

export type KitTag = Pose | BodyTag

/** The tags a sheet must carry: every pose, and the body tags Kit plays. */
const REQUIRED: readonly KitTag[] = [
  'rest',
  'lean_in',
  'think',
  'nod',
  'tilt',
  'shrug',
  'wave',
  'point',
  'stretch',
  'celebrate',
  'sit',
  'sway',
  'pounce',
  'sleep',
]

/** A sprite sheet of square frames laid out in rows, with its animations. */
export interface KitSheet {
  /** The side of one frame, in sheet pixels. */
  readonly frame: number
  readonly columns: number
  readonly width: number
  readonly height: number
  /** How long each frame shows, in milliseconds, by frame index. */
  readonly durations: readonly number[]
  /** Each animation's first and last frame index, inclusive. */
  readonly tags: Readonly<Record<KitTag, readonly [number, number]>>
}

/** The part of Aseprite's JSON export (array layout) a sheet is read from. */
export interface AsepriteExport {
  readonly frames: readonly {
    readonly frame: {
      readonly x: number
      readonly y: number
      readonly w: number
      readonly h: number
    }
    readonly duration: number
  }[]
  readonly meta: {
    readonly size: { readonly w: number; readonly h: number }
    readonly frameTags: readonly {
      readonly name: string
      readonly from: number
      readonly to: number
    }[]
  }
}

/**
 * Reads an Aseprite export into a sheet. The frames must be square, one size,
 * and laid out row by row from the top left; a missing pose or a frame out of
 * place is an error here rather than a wrong frame on screen.
 */
export function readSheet(source: AsepriteExport): KitSheet {
  const first = source.frames[0]
  if (!first) throw new Error('Kit sheet: no frames')
  const frame = first.frame.w
  const columns = Math.floor(source.meta.size.w / frame)
  source.frames.forEach(({ frame: box }, index) => {
    const x = (index % columns) * frame
    const y = Math.floor(index / columns) * frame
    if (box.w !== frame || box.h !== frame || box.x !== x || box.y !== y)
      throw new Error(`Kit sheet: frame ${index} is not at ${x},${y}`)
  })
  const tags: Partial<Record<string, readonly [number, number]>> = {}
  for (const { name, from, to } of source.meta.frameTags)
    tags[name] = [from, to] as const
  const missing = REQUIRED.filter((tag) => !tags[tag])
  if (missing.length)
    throw new Error(`Kit sheet: no tag for ${missing.join(', ')}`)
  return {
    frame,
    columns,
    width: source.meta.size.w,
    height: source.meta.size.h,
    durations: source.frames.map(({ duration }) => duration),
    tags: tags as Record<KitTag, readonly [number, number]>,
  }
}

/** Where a frame sits on the sheet, in sheet pixels. */
export function frameOrigin(sheet: KitSheet, index: number): [number, number] {
  return [
    (index % sheet.columns) * sheet.frame,
    Math.floor(index / sheet.columns) * sheet.frame,
  ]
}

/** One pass of a tag, in milliseconds. */
export function tagLength(sheet: KitSheet, tag: KitTag): number {
  const [from, to] = sheet.tags[tag]
  let total = 0
  for (let index = from; index <= to; index++)
    total += sheet.durations[index] ?? 0
  return total
}

/**
 * The frame a tag shows `elapsed` milliseconds after it began, and how long
 * until the next one. A tag played once holds its last frame, with no next.
 */
export function frameAt(
  sheet: KitSheet,
  tag: KitTag,
  elapsed: number,
  once: boolean,
): { index: number; next: number } {
  const [from, to] = sheet.tags[tag]
  const length = tagLength(sheet, tag)
  if (length <= 0) return { index: from, next: Infinity }
  if (once && elapsed >= length) return { index: to, next: Infinity }
  let into = Math.max(0, elapsed) % length
  for (let index = from; index <= to; index++) {
    const duration = sheet.durations[index] ?? 0
    if (into < duration) return { index, next: duration - into }
    into -= duration
  }
  return { index: to, next: Infinity }
}

/** Kit's sheet: src/assets/kit/kit.png, as its Aseprite export describes it. */
export const KIT_SHEET = readSheet(exported)
