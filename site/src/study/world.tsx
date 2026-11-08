// SOURCING: @react-three/fiber (Canvas, pointer events on the model), drei (Html in transform mode lays a DOM surface on a face of the room; Html in screen mode carries the labels and the book notes' triggers; useVideoTexture for the tube's loop), three's VideoTexture for the film, coss Popover for the book notes. drei's Html renders into a React root of its own, so a destination's surface is only a target: the page fills it with a portal and the content keeps the page's context.
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react'
import type { RefObject } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import type { ThreeEvent } from '@react-three/fiber'
import { Html, useGLTF, useVideoTexture } from '@react-three/drei'
import * as THREE from 'three'
import {
  Popover,
  PopoverDescription,
  PopoverPopup,
  PopoverTitle,
  PopoverTrigger,
} from '@/components/ui/popover'
import { study as copy } from '@/content'
import type { Destination, View } from '@/experience/experience'
import { Director } from './director'
import type { Areas } from './director'
import { useLiveField } from './live-field'
import { settling } from './crt'
import { ROOM_ASSETS, StudyRoom } from './room'
import { FOV, SHOTS } from './shots'
import { SURFACES } from './surfaces'
import type { SurfaceName } from './surfaces'
import type { Glass } from './tube'

/**
 * How much of the room the glass reflects over the live app. The page screens the app over the tube in sRGB, where a
 * dim reflection adds about three times what the same light adds to the film in the tube's linear light, so this
 * share makes the app on the glass read as the film's last frame did.
 */
const REFLECTIONS_OVER_APP = 0.3

type BookId = (typeof copy.books)[number]['id']
type Pick = { to: Destination } | { book: BookId }

/** What selecting each part of the model does. A part not named here is the room. */
const PICKS: Record<string, Pick> = {
  Computer: { to: 'experience' },
  Keyboard: { to: 'experience' },
  Mouse: { to: 'experience' },
  Cables: { to: 'experience' },
  Working: { to: 'possibilities' },
  Pen: { to: 'possibilities' },
  Pad: { to: 'join' },
  Book_dream: { book: 'dream' },
  Book_hamming: { book: 'hamming' },
  Ribbon: { book: 'hamming' },
  Book_everyone: { book: 'everyone' },
}

function pickOf(object: THREE.Object3D | null): { node: THREE.Object3D; pick: Pick } | null {
  for (let node = object; node; node = node.parent) {
    const pick = PICKS[node.name]
    if (pick) return { node, pick }
  }
  return null
}

const labelOf = (pick: Pick) =>
  'to' in pick
    ? copy.select[pick.to]
    : `${copy.noteLabel} ${copy.books.find((book) => book.id === pick.book)?.title}`

export interface WorldProps {
  view: View
  areas: Areas
  onArrive: (view: View) => void
  /** The narrated film's element: the tube shows it while it plays and the tour follows its clock. */
  film: RefObject<HTMLVideoElement | null>
  /** The film is playing: the camera tours with it. */
  watching: boolean
  /** The tube shows the film, through its last frame, until the app takes over. */
  showFilm: boolean
  /** Under the app on the glass the tube goes dark, then reflects the room over it. */
  glass: Glass
  /** The film's loop for the tube while nothing else is on it. */
  ambient: string
  explore: boolean
  fieldRunning: boolean
  seed: number
  /** Where each surface's DOM goes: the tube over the room as it is, the sheets multiplied into their paper. */
  layers: { screen: RefObject<HTMLDivElement | null>; paper: RefObject<HTMLDivElement | null> }
  onTarget: (name: SurfaceName, el: HTMLDivElement | null) => void
  onSelect: (to: Destination) => void
  /** The app expanded off the glass: the tube's surface at this CSS size, about the same centre. */
  tubeSize?: { width: number; height: number }
}

export function World(props: WorldProps) {
  return (
    <Canvas
      shadows
      dpr={[1, 2]}
      camera={{ fov: FOV, near: 0.02, far: 12, position: [...SHOTS.opening.position] }}
      gl={{ antialias: true, toneMapping: THREE.NeutralToneMapping }}
      aria-label={copy.label}
      role="img"
    >
      <color attach="background" args={['#F1F3F5']} />
      <Suspense fallback={null}>
        <Room {...props} />
      </Suspense>
    </Canvas>
  )
}

function Room({
  view,
  areas,
  onArrive,
  film,
  watching,
  showFilm,
  glass,
  ambient,
  explore,
  fieldRunning,
  seed,
  layers,
  onTarget,
  onSelect,
  tubeSize,
}: WorldProps) {
  const loop = useVideoTexture(ambient, { muted: true, loop: true, start: true })
  const { texture } = useLiveField({ seed, running: fieldRunning })
  // The film's element is mounted with the page, so its texture can be made once.
  const [filmTexture] = useState(() => (film.current ? new THREE.VideoTexture(film.current) : null))
  useEffect(() => () => filmTexture?.dispose(), [filmTexture])
  // The element is kept out of sight, so the browser never presents its frames and
  // VideoTexture's frame callback never fires: the picture is taken every frame instead.
  useFrame(() => {
    const video = film.current
    if (showFilm && filmTexture && video && video.readyState >= video.HAVE_CURRENT_DATA)
      filmTexture.needsUpdate = true
  })

  // The film flattens on the tube over its last seconds, so its last frame meets the flat app; the loop keeps its bow.
  const settle = useCallback(() => (showFilm ? settling(film.current) : 1), [showFilm, film])

  const [hover, setHover] = useState<{ node: THREE.Object3D; pick: Pick } | null>(null)
  const [openBook, setOpenBook] = useState<BookId | null>(null)
  const wide = view === 'wide'

  useEffect(() => {
    if (!wide) {
      setHover(null)
      setOpenBook(null)
    }
  }, [wide])
  useEffect(() => {
    document.body.style.cursor = hover ? 'pointer' : ''
    return () => void (document.body.style.cursor = '')
  }, [hover])

  const events = wide
    ? {
        onPointerMove: (event: ThreeEvent<PointerEvent>) => {
          event.stopPropagation()
          const found = pickOf(event.object)
          setHover((was) => (was?.node === found?.node ? was : found))
        },
        onPointerOut: () => setHover(null),
        onClick: (event: ThreeEvent<MouseEvent>) => {
          // A drag that turned the room is not a selection.
          if (event.delta > 4) return
          const found = pickOf(event.object)
          if (!found) return
          event.stopPropagation()
          if ('to' in found.pick) onSelect(found.pick.to)
          else setOpenBook(found.pick.book)
        },
      }
    : {}

  return (
    <>
      <Director
        view={view}
        areas={areas}
        onArrive={onArrive}
        film={film}
        touring={watching}
        explore={explore && wide}
      />
      <StudyRoom
        assets={ROOM_ASSETS}
        film={glass !== 'off' ? null : showFilm && filmTexture ? filmTexture : loop}
        reflections={glass === 'dark' ? 0 : glass === 'on' ? REFLECTIONS_OVER_APP : 1}
        field={texture}
        settle={settle}
        events={events}
      >
        <Surface name="tube" layer={layers.screen} onTarget={onTarget} active={view === 'experience'} size={tubeSize} />
        <Surface name="possibilities" layer={layers.paper} onTarget={onTarget} active={view === 'possibilities'} />
        <Surface name="join" layer={layers.paper} onTarget={onTarget} active={view === 'join'} />
        {hover && !(openBook && 'book' in hover.pick) && <Label node={hover.node} text={labelOf(hover.pick)} />}
        <BookNotes shown={wide} open={openBook} onOpenChange={setOpenBook} />
      </StudyRoom>
    </>
  )
}

/** A face of the room that a destination's DOM lies on, at the CSS size it lays out at. */
function Surface({
  name,
  layer,
  onTarget,
  active,
  size,
}: {
  name: SurfaceName
  layer: RefObject<HTMLDivElement | null>
  onTarget: WorldProps['onTarget']
  /** Only the destination in front of the visitor takes the pointer; the others let it through to the room. */
  active: boolean
  size?: { width: number; height: number }
}) {
  const s = SURFACES[name]
  // A stable callback: a new one each render would detach and reattach the target, and the page would set it forever.
  const ref = useCallback((el: HTMLDivElement | null) => onTarget(name, el), [name, onTarget])
  return (
    <Html
      transform
      portal={layer as RefObject<HTMLElement>}
      position={s.center}
      quaternion={s.quaternion}
      distanceFactor={s.distanceFactor}
      zIndexRange={[20, 10]}
      pointerEvents={active ? 'auto' : 'none'}
      ref={ref}
      className="room-surface"
      style={size ?? s.css}
    />
  )
}

const box = new THREE.Box3()
/** Over a part's top, or for a book in the stack, on its spine, which faces the room. */
const anchorOf = (node: THREE.Object3D) => {
  node.updateWorldMatrix(true, true)
  box.setFromObject(node)
  const book = node.name.startsWith('Book_')
  return new THREE.Vector3(
    (box.min.x + box.max.x) / 2,
    book ? (box.min.y + box.max.y) / 2 : box.max.y,
    book ? box.max.z : (box.min.z + box.max.z) / 2,
  )
}

/** Says what selecting a part of the room does, over its top. */
function Label({ node, text }: { node: THREE.Object3D; text: string }) {
  const at = useMemo(() => anchorOf(node), [node])
  return (
    <Html position={at} center zIndexRange={[30, 30]} pointerEvents="none" className="room-label-anchor">
      <span className="room-label">{text}</span>
    </Html>
  )
}

/**
 * Each book's note opens over its spine, from a selection in the room or from a
 * keyboard: the trigger is a real button there, out of sight until it has focus.
 */
function BookNotes({
  shown,
  open,
  onOpenChange,
}: {
  shown: boolean
  open: BookId | null
  onOpenChange: (book: BookId | null) => void
}) {
  const { scene } = useGLTF(ROOM_ASSETS.glb)
  const anchors = useMemo(
    () =>
      Object.fromEntries(
        copy.books.map((book) => {
          const node = scene.getObjectByName(`Book_${book.id}`)
          return [book.id, node ? anchorOf(node) : null]
        }),
      ) as Record<BookId, THREE.Vector3 | null>,
    [scene],
  )
  return (
    <>
      {copy.books.map((book) => {
        const at = anchors[book.id]
        if (!at) return null
        return (
          <Html key={book.id} position={at} center zIndexRange={[40, 40]} className="room-note-anchor">
            <Popover open={shown && open === book.id} onOpenChange={(next) => onOpenChange(next ? book.id : null)}>
              <PopoverTrigger
                className="room-note-trigger"
                tabIndex={shown ? 0 : -1}
                aria-label={`${copy.noteLabel} ${book.title}`}
              >
                <span aria-hidden>{book.title}</span>
              </PopoverTrigger>
              <PopoverPopup side="top" sideOffset={10} className="max-w-80">
                <PopoverTitle className="text-base">{book.title}</PopoverTitle>
                <p className="text-sm text-muted-ink">{book.author}</p>
                <PopoverDescription className="mt-2 text-pretty">{book.note}</PopoverDescription>
              </PopoverPopup>
            </Popover>
          </Html>
        )
      })}
    </>
  )
}
