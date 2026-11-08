// SOURCING: the site's own field (src/field/mount-field.ts, unchanged in its rules and tuning) and three's CanvasTexture. The field keeps its own canvas and frame loop; this only hands that canvas to the scene and maps the pointer from the wall back to the field.
import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mountField } from '../field/mount-field'
import type { FieldHandle } from '../field/mount-field'
import { FIELD, FIELD_ON, FIELD_PX_PER_M } from './room'

/** The field's cells stay 8 CSS pixels; at this density its canvas is cheap enough to upload every frame. */
const DENSITY = 1.5

const raycaster = new THREE.Raycaster()
const pointer = new THREE.Vector2()

/** The part of the model a hit landed on that the Life lies on, if any. */
const onField = (object: THREE.Object3D | null) => {
  for (let node = object; node; node = node.parent) if (FIELD_ON.has(node.name)) return true
  return false
}

/**
 * Runs the Life on an offstage canvas the size of its footprint on the wall and
 * returns it as a texture. The canvas is cleared between glyphs, so the wall's paper
 * shows through. A pointer paints only where it actually reaches the wall, the canvas
 * or the casings: over the computer or the books, it does not.
 */
export function useLiveField({ seed, running }: { seed: number; running: boolean }) {
  const { camera, gl, scene } = useThree()
  const handle = useRef<FieldHandle | null>(null)
  const texture = useMemo(() => {
    const canvas = document.createElement('canvas')
    const made = new THREE.CanvasTexture(canvas)
    made.colorSpace = THREE.SRGBColorSpace
    made.generateMipmaps = false
    made.minFilter = THREE.LinearFilter
    made.magFilter = THREE.LinearFilter
    return made
  }, [])

  useEffect(() => {
    const host = document.createElement('div')
    const width = Math.round((FIELD.x1 - FIELD.x0) * FIELD_PX_PER_M)
    const height = Math.round((FIELD.y1 - FIELD.y0) * FIELD_PX_PER_M)
    // Offstage, not display:none: the field measures its host, and its canvas is still drawn to.
    host.setAttribute('aria-hidden', 'true')
    host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;height:${height}px;opacity:0;pointer-events:none;z-index:-1;overflow:hidden`
    document.body.append(host)
    const field = mountField(host, {
      seed,
      running,
      density: DENSITY,
      locate(event) {
        const rect = gl.domElement.getBoundingClientRect()
        pointer.set(
          ((event.clientX - rect.left) / rect.width) * 2 - 1,
          -((event.clientY - rect.top) / rect.height) * 2 + 1,
        )
        raycaster.setFromCamera(pointer, camera)
        const [nearest] = raycaster
          .intersectObjects(scene.children, true)
          .filter((hit) => hit.object.visible && !(hit.object instanceof THREE.Line))
        if (!nearest || !onField(nearest.object)) return undefined
        const u = (nearest.point.x - FIELD.x0) / (FIELD.x1 - FIELD.x0)
        const v = (nearest.point.y - FIELD.y0) / (FIELD.y1 - FIELD.y0)
        if (u < 0 || u > 1 || v < 0 || v > 1) return undefined
        return { clientX: u * width, clientY: (1 - v) * height }
      },
    })
    handle.current = field
    const canvas = host.querySelector('canvas')
    if (canvas) texture.image = canvas
    return () => {
      handle.current = null
      field.destroy()
      host.remove()
    }
  }, [seed, camera, gl, scene, texture, running])

  useEffect(() => {
    handle.current?.setRunning(running)
  }, [running])

  const uploaded = useRef({ width: 0, height: 0, frames: 0 })
  useFrame(() => {
    const canvas = texture.image as HTMLCanvasElement | null
    if (!canvas) return
    const last = uploaded.current
    // The field sets its canvas's size on its first frame, and three's texture storage is immutable once allocated.
    if (canvas.width !== last.width || canvas.height !== last.height) {
      last.width = canvas.width
      last.height = canvas.height
      last.frames = 0
      texture.dispose()
    }
    // A held field stops drawing after its first frames, so it stops uploading too.
    if (running || last.frames++ < 30) texture.needsUpdate = true
  })

  return { texture, field: handle }
}
