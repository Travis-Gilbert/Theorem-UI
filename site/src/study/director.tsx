// SOURCING: drei's CameraControls over camera-controls 3.1, the one controller that owns the camera: its setLookAt transitions are the moves, the promise they return is the arrival, and its ACTION table says which gestures it takes. Where each view puts the camera is surfaces.ts and shots.ts.
import { useEffect, useLayoutEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { CameraControls } from '@react-three/drei'
import { useFrame, useThree } from '@react-three/fiber'
import CameraControlsImpl from 'camera-controls'
import * as THREE from 'three'
import type { View } from '@/experience/experience'
import { SHOTS, TOUR } from './shots'
import type { ShotName } from './shots'
import { SURFACES, frame, frameWide } from './surfaces'
import type { Area, Pose, SurfaceName } from './surfaces'

const { ACTION } = CameraControlsImpl

/** The viewport areas each view is framed in, in CSS pixels. */
export interface Areas {
  wide: Area
  destination: Area
}

const SURFACE_OF: Record<Exclude<View, 'wide'>, SurfaceName> = {
  experience: 'tube',
  possibilities: 'possibilities',
  join: 'join',
}

/** How far a visitor can turn the room by dragging it, either way from the wide view. */
const LOOK_AROUND = { azimuth: 0.2, polar: 0.08 }
/** A move between destinations, and the slower moves of the guided tour, in camera-controls' smoothing time. */
const SMOOTH = { move: 0.6, tour: 1.05 }

export function poseFor(
  view: View,
  viewport: { width: number; height: number },
  areas: Areas,
): Pose {
  if (view === 'wide') return frameWide(viewport, areas.wide)
  return frame(SURFACES[SURFACE_OF[view]], viewport, areas.destination)
}

const typing = () => {
  const el = document.activeElement
  return (
    el instanceof HTMLIFrameElement ||
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  )
}

/**
 * Puts the camera where the view is and says when it is there: that report is
 * the reveal gate's camera condition. While the film plays it follows the film's
 * clock through the tour instead, and the tour's last pose is this view's.
 */
export function Director({
  view,
  areas,
  onArrive,
  film,
  touring,
  explore,
}: {
  view: View
  areas: Areas
  onArrive: (view: View) => void
  /** The narrated film, whose clock the tour follows. */
  film: RefObject<HTMLVideoElement | null>
  touring: boolean
  /** The wide view can be turned a little by dragging. */
  explore: boolean
}) {
  const controls = useRef<CameraControls>(null)
  const size = useThree((state) => state.size)
  /** The view the camera was last sent to, or the tour while it runs. */
  const placed = useRef<View | 'tour' | null>(null)
  const move = useRef(0)
  const shot = useRef<ShotName | 'end' | null>(null)

  const go = (pose: Pose, smooth: boolean) =>
    controls.current?.setLookAt(
      pose.position.x,
      pose.position.y,
      pose.position.z,
      pose.target.x,
      pose.target.y,
      pose.target.z,
      smooth,
    )

  // Limits and gestures are set before every move, since camera-controls clamps a move to its limits.
  const hold = (c: CameraControlsImpl) => {
    c.minAzimuthAngle = -Infinity
    c.maxAzimuthAngle = Infinity
    c.minPolarAngle = 0
    c.maxPolarAngle = Math.PI
    c.mouseButtons.left = ACTION.NONE
  }
  const letLookAround = (c: CameraControlsImpl) => {
    if (!explore || typing()) return
    c.minAzimuthAngle = c.azimuthAngle - LOOK_AROUND.azimuth
    c.maxAzimuthAngle = c.azimuthAngle + LOOK_AROUND.azimuth
    c.minPolarAngle = c.polarAngle - LOOK_AROUND.polar
    c.maxPolarAngle = c.polarAngle + LOOK_AROUND.polar
    c.mouseButtons.left = ACTION.ROTATE
  }

  useLayoutEffect(() => {
    const c = controls.current
    if (!c) return
    c.mouseButtons.middle = ACTION.NONE
    c.mouseButtons.right = ACTION.NONE
    c.mouseButtons.wheel = ACTION.NONE
    c.touches.one = ACTION.NONE
    c.touches.two = ACTION.NONE
    c.touches.three = ACTION.NONE
  }, [])

  useLayoutEffect(() => {
    const c = controls.current
    if (!c || touring) return
    const token = ++move.current
    const first = placed.current === null
    const smooth = !first && placed.current !== view
    placed.current = view
    shot.current = null
    hold(c)
    c.smoothTime = SMOOTH.move
    void go(poseFor(view, size, areas), smooth)?.then(() => {
      if (move.current !== token) return
      onArrive(view)
      if (view === 'wide') letLookAround(c)
    })
    // `areas` is compared by value: a new object with the same numbers is no move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, touring, size.width, size.height, JSON.stringify(areas), explore])

  // The tour: each second of the film has its pose, so pausing holds the camera and seeking moves it.
  useFrame(() => {
    const c = controls.current
    const video = film.current
    if (!c || !touring || !video) return
    const at = video.currentTime
    const step = TOUR.findLast((key) => key.at <= at)
    const next: ShotName | 'end' | null =
      step === undefined ? null : step === TOUR.at(-1) ? 'end' : step.shot
    if (next === shot.current) return
    shot.current = next
    move.current++
    placed.current = 'tour'
    hold(c)
    c.smoothTime = SMOOTH.tour
    if (next === null) return
    const pose =
      next === 'end'
        ? poseFor('experience', size, areas)
        : {
            position: new THREE.Vector3(...SHOTS[next].position),
            target: new THREE.Vector3(...SHOTS[next].target),
          }
    void go(pose, true)
  })

  // Nothing turns the room while someone types, wherever the field is.
  useEffect(() => {
    const changed = () => {
      const c = controls.current
      if (!c) return
      if (typing()) c.mouseButtons.left = ACTION.NONE
      else if (placed.current === 'wide' && !touring) letLookAround(c)
    }
    document.addEventListener('focusin', changed)
    document.addEventListener('focusout', changed)
    return () => {
      document.removeEventListener('focusin', changed)
      document.removeEventListener('focusout', changed)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [touring, explore])

  useEffect(() => {
    Object.assign(window, {
      __study: {
        get camera() {
          return controls.current?.camera
        },
        get controls() {
          return controls.current
        },
      },
    })
  }, [])

  return <CameraControls ref={controls} makeDefault smoothTime={SMOOTH.move} />
}
