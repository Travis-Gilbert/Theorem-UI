// SOURCING: hand-rolled over three's Vector3 and Quaternion. Where each panel lies comes from layout.json, which study/build_study.py writes beside the model; the pose that shows a DOM surface square at a chosen CSS scale through this lens is this room's own arithmetic, and camera-controls moves between the poses.
import * as THREE from 'three'
import layout from './layout.json'
import { LOGICAL } from '@/experience/experience'
import { FOV, SHOTS } from './shots'
import { TUBE_MAX_SCALE } from './tube'

export type SurfaceName = 'tube' | 'possibilities' | 'join'

export interface Surface {
  name: SurfaceName
  /** The middle of the face the panel lies on, in metres. */
  center: THREE.Vector3
  /** Out of the face, toward whoever reads it. */
  normal: THREE.Vector3
  /** Up the page, in the face. */
  up: THREE.Vector3
  right: THREE.Vector3
  /** The panel's CSS size: what it lays out at, whatever the camera does. */
  css: { width: number; height: number }
  pxPerMetre: number
  /** drei Html's distanceFactor for that density: one CSS pixel is distanceFactor / 400 metres. */
  distanceFactor: number
  quaternion: THREE.Quaternion
  /** The largest the camera shows it, so text never grows past what reads comfortably. */
  maxScale: number
}

const vec = (v: readonly number[]) => new THREE.Vector3(...(v as [number, number, number]))
const cssOf = (css: readonly number[]) => {
  const [width, height] = css as [number, number]
  return { width, height }
}

function surface(
  name: SurfaceName,
  record: { center: number[]; normal: number[]; up: number[] },
  css: { width: number; height: number },
  widthMetres: number,
  maxScale: number,
  /** How far behind the recorded face the panel sits. */
  depth = 0,
): Surface {
  const normal = vec(record.normal).normalize()
  const up = vec(record.up).normalize()
  const right = new THREE.Vector3().crossVectors(up, normal).normalize()
  const quaternion = new THREE.Quaternion().setFromRotationMatrix(
    new THREE.Matrix4().makeBasis(right, up, normal),
  )
  const pxPerMetre = css.width / widthMetres
  return {
    name,
    center: vec(record.center).addScaledVector(normal, -depth),
    normal,
    up,
    right,
    css,
    pxPerMetre,
    distanceFactor: 400 / pxPerMetre,
    quaternion,
    maxScale,
  }
}

/** The app on the tube lays out at the raster's own proportions. The film's tube cut and its last frame are made at this size. */
export const TUBE_LOGICAL = LOGICAL.tube

/** The live app lies where the raster's edge meets the bowed glass, so its outline sits on the raster's from any angle. */
const TUBE_DEPTH = layout.screen.edgeDepth

export const SURFACES: Record<SurfaceName, Surface> = {
  tube: surface(
    'tube',
    layout.screen,
    TUBE_LOGICAL,
    layout.screen.halfWidth * 2,
    TUBE_MAX_SCALE,
    TUBE_DEPTH,
  ),
  possibilities: surface(
    'possibilities',
    layout.possibilities,
    cssOf(layout.possibilities.css),
    layout.possibilities.width,
    1.15,
  ),
  join: surface(
    'join',
    layout.join,
    cssOf(layout.join.css),
    layout.join.width,
    1.2,
  ),
}

export interface Pose {
  position: THREE.Vector3
  target: THREE.Vector3
}

export interface Area {
  /** The part of the viewport the surface is framed in, in CSS pixels. */
  left: number
  top: number
  width: number
  height: number
}

const HALF_FOV = Math.tan(((FOV / 2) * Math.PI) / 180)

/** How many CSS pixels of the viewport one metre at this distance spans. */
export const pixelsPerMetreAt = (distance: number, viewportHeight: number) =>
  viewportHeight / (2 * distance * HALF_FOV)

/** The scale a surface is shown at in this area: whole, and never past its own most. */
export const scaleIn = (s: Surface, area: Area) =>
  Math.min(s.maxScale, area.width / s.css.width, area.height / s.css.height)

/**
 * What the wide view keeps whole: the pad on the left, the computer, the books and
 * lamp, the sheet and pen on the right, as half-extents across and up the frame.
 */
const WIDE_SUBJECT = { center: new THREE.Vector3(0.11, 0.13, 0.06), across: 0.76, up: 0.4 }
/** The opening shot's bearing, a little lower than the film's, so the slate gives way to the Life on the wall. */
const WIDE_FROM = new THREE.Vector3(0.58, 0.4, 1.28)
/** The subject sits this share of the area below its middle, under more of the wall. */
const WIDE_DROP = 0.07
const UP = new THREE.Vector3(0, 1, 0)

/**
 * The opening shot fitted to the part of the viewport between the bar and the row of ways in: the same
 * direction, as close as keeps the subject whole in the area, aimed so the subject
 * sits in the area's middle. camera-controls' own fitToSphere fits the whole
 * viewport, and fitToBox turns the camera square to a face, so this is ours.
 */
export function frameWide(
  viewport: { width: number; height: number },
  area: Area,
): Pose {
  const direction = WIDE_FROM.clone().sub(new THREE.Vector3(...SHOTS.opening.target)).normalize()
  const distance = Math.max(
    WIDE_SUBJECT.across / ((HALF_FOV * area.width) / viewport.height),
    WIDE_SUBJECT.up / ((HALF_FOV * area.height) / viewport.height),
  )
  const forward = direction.clone().negate()
  const right = new THREE.Vector3().crossVectors(forward, UP).normalize()
  const up = new THREE.Vector3().crossVectors(right, forward)
  const metresPerPx = (2 * distance * HALF_FOV) / viewport.height
  const dx = area.left + area.width / 2 - viewport.width / 2
  const dy = area.top + area.height * (0.5 + WIDE_DROP) - viewport.height / 2
  const target = WIDE_SUBJECT.center
    .clone()
    .addScaledVector(right, -dx * metresPerPx)
    .addScaledVector(up, dy * metresPerPx)
  return { position: target.clone().addScaledVector(direction, distance), target }
}

/**
 * The camera pose that shows a surface square on, its centre in the middle of the
 * area, one CSS pixel of it as `scale` viewport pixels. A flat sheet is looked at
 * from a hair toward its foot, so the camera's up is the page's up.
 */
export function frame(
  s: Surface,
  viewport: { width: number; height: number },
  area: Area,
): Pose & { scale: number } {
  const scale = scaleIn(s, area)
  const distance = viewport.height / (2 * scale * s.pxPerMetre * HALF_FOV)
  const metresPerPx = 1 / (scale * s.pxPerMetre)
  const dx = area.left + area.width / 2 - viewport.width / 2
  const dy = area.top + area.height / 2 - viewport.height / 2
  const target = s.center
    .clone()
    .addScaledVector(s.right, -dx * metresPerPx)
    .addScaledVector(s.up, dy * metresPerPx)
  const position = target.clone().addScaledVector(s.normal, distance)
  if (Math.abs(s.normal.y) > 0.9) position.addScaledVector(s.up, -distance * 0.0015)
  return { position, target, scale }
}
