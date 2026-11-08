// SOURCING: three's MeshPhysicalMaterial over the bowed raster (its emissive map is the picture, its specular the glass's own reflections, which never depend on the picture), extended with onBeforeCompile for the bow, the edge shading and a quiet scan; a ShaderMaterial plane for the halo on the glass round the raster; three's RectAreaLight for the picture's light on the desk. drei has no CRT, and postprocessing's CRT and bloom effects work on the whole frame, where this is one surface in it and the live app on it is DOM the canvas never draws.
import { useLayoutEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { LOGICAL } from '../experience/logical'
import layout from './layout.json'
import { TUBE_EDGE } from './tube-edge'

const { screen } = layout
const APP = LOGICAL.tube

/**
 * One treatment for the tube, whatever is on it. The film gets the whole of it in the shader; the live app keeps the
 * same edge shading in its CSS (tube-edge.ts), the same halo and light here, and the same glass, screened over it.
 */
export const CRT = {
  /** The picture's bow, as a share of its half-size gained at the corners. Only the film bows; the app is flat DOM. */
  curve: 0.03,
  /** Scan lines, kept quiet: a Classic II's 342 lines on a monochrome tube, no colour mask to show. */
  scan: 0.035,
  lines: 342,
  /** Over a film's last seconds (from, to before its end) the bow and scan go, so its last frame lies exactly where the flat app takes over. */
  settle: [2.4, 0.9] as const,
  /** The glow on the glass round the raster at a white picture: its strength at the raster's edge, how fast it falls off and how far it reaches, in metres. */
  halo: { strength: 0.14, falloff: 0.0026, reach: 0.012 },
  /** The picture's light on what is in front of it: nits at a white picture, seconds to follow the picture, and how bright the live app counts as. */
  light: { nits: 6, follow: 0.25, app: 0.6 },
  /** A white phosphor, a touch cool. */
  phosphor: '#e9eef7',
  /** How fast the glass's reflections come up over the app once it is screened over the glass, in seconds. */
  reflectionsRise: 0.6,
}

/** How much of the bow is left at this point in a film: all of it until its last seconds, none at its end. */
export function settling(video: HTMLVideoElement | null) {
  if (!video || !Number.isFinite(video.duration)) return 1
  const [from, to] = CRT.settle
  return THREE.MathUtils.smoothstep(video.duration - video.currentTime, to, from)
}

const SQRT2 = Math.SQRT2.toFixed(6)

function screenMaterial(uniforms: Record<string, THREE.IUniform>) {
  const material = new THREE.MeshPhysicalMaterial({
    color: '#000000',
    roughness: 0.22,
    metalness: 0,
    emissive: '#ffffff',
    toneMapped: false,
    // Everything in the room is out of the opaque pass, so the liquid glass on the wall refracts only the wall (room.tsx).
    transparent: true,
  })
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        uniform float crtSettle;
        uniform float crtCurve;
        uniform float crtScan;
        uniform float crtLines;
        uniform vec2 crtApp;
        uniform float crtRadius;
        uniform vec4 crtEdge;
        uniform vec2 crtShadow;
        // How far inside the rounded raster's edge a point is, in the app's CSS pixels.
        float crtInside(vec2 px) {
          vec2 q = abs(px - 0.5 * crtApp) - (0.5 * crtApp - crtRadius);
          return crtRadius - length(max(q, 0.0)) - min(max(q.x, q.y), 0.0);
        }`,
      )
      .replace(
        '#include <emissivemap_fragment>',
        `#ifdef USE_EMISSIVEMAP
          vec2 crtP = vEmissiveMapUv * 2.0 - 1.0;
          float crtBow = crtCurve * crtSettle;
          vec2 crtUv = crtP * (1.0 + crtBow * crtP.yx * crtP.yx) * 0.5 + 0.5;
          vec4 emissiveColor = texture2D(emissiveMap, crtUv);
          #ifdef DECODE_VIDEO_TEXTURE_EMISSIVE
            emissiveColor = sRGBTransferEOTF(emissiveColor);
          #endif
          // Past the bowed picture's edge the tube is dark.
          vec2 crtIn = step(vec2(0.0), crtUv) * step(crtUv, vec2(1.0));
          emissiveColor.rgb *= crtIn.x * crtIn.y;
          emissiveColor.rgb *= 1.0 - crtScan * crtSettle * (0.5 + 0.5 * cos(crtUv.y * crtLines * 6.2831853));
          // The edge shading, as the app's CSS draws it over the glass, in its sRGB terms.
          float crtD = crtInside(vEmissiveMapUv * crtApp);
          float crtT = length(crtP) / ${SQRT2};
          float crtKeep = (1.0 - crtEdge.y * clamp((crtT - crtEdge.x) / (1.0 - crtEdge.x), 0.0, 1.0))
            * (1.0 - crtEdge.z * (1.0 - smoothstep(crtShadow.x - crtShadow.y, crtShadow.x + crtShadow.y, crtD)))
            * (1.0 - crtEdge.w * (1.0 - smoothstep(0.5, 1.5, crtD)));
          emissiveColor.rgb *= pow(crtKeep, 2.2);
          totalEmissiveRadiance *= emissiveColor.rgb;
        #endif`,
      )
  }
  return material
}

function haloMaterial(uniforms: Record<string, THREE.IUniform>) {
  return new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    toneMapped: false,
    vertexShader: `
      varying vec2 vAt;
      void main() {
        vAt = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: `
      uniform vec2 haloHalf;
      uniform float haloRadius;
      uniform float haloFalloff;
      uniform vec3 haloColor;
      varying vec2 vAt;
      void main() {
        vec2 q = abs(vAt) - (haloHalf - haloRadius);
        float d = length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - haloRadius;
        if (d < 0.0) discard;
        gl_FragColor = vec4(haloColor * exp(-d / haloFalloff), 1.0);
      }`,
  })
}

/** The picture's mean brightness, linear, 0 to 1, from a tiny copy of it. Null when it cannot be read yet. */
function useBrightness() {
  return useMemo(() => {
    const probe = document.createElement('canvas')
    probe.width = 16
    probe.height = 12
    const context = probe.getContext('2d', { willReadFrequently: true })
    return (image: unknown): number | null => {
      if (!context || !image) return null
      if (image instanceof HTMLVideoElement && image.readyState < image.HAVE_CURRENT_DATA) return null
      try {
        context.drawImage(image as CanvasImageSource, 0, 0, probe.width, probe.height)
        const { data } = context.getImageData(0, 0, probe.width, probe.height)
        let sum = 0
        for (let i = 0; i < data.length; i += 4) {
          const luma = (0.2126 * data[i]! + 0.7152 * data[i + 1]! + 0.0722 * data[i + 2]!) / 255
          sum += luma ** 2.2
        }
        return sum / (data.length / 4)
      } catch {
        return null
      }
    }
  }, [])
}

const centre = new THREE.Vector3(...(screen.center as [number, number, number]))
const normal = new THREE.Vector3(...(screen.normal as [number, number, number])).normalize()
const up = new THREE.Vector3(...(screen.up as [number, number, number])).normalize()
const right = new THREE.Vector3().crossVectors(up, normal).normalize()
/** The raster's own frame: x across it, y up it, z out of the glass. */
const facing = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, up, normal))
/** The halo lies where the raster's edge meets the bowed glass, like the live app, a hair in front of it. */
const haloAt = centre.clone().addScaledVector(normal, -screen.edgeDepth + 0.0006)
const lightAt = centre.clone().addScaledVector(normal, 0.003)
const lightTarget = centre.clone().add(normal)

/**
 * The tube as layers that stay put whatever it shows: the recess and the bowed glass are the model's; this adds the
 * picture with its bow, scan and edge shading, the glass's reflections over it, the halo round it and its light on the
 * desk. With no film (the live app is up, as DOM over the glass) the picture is dark and the halo and light hold at
 * the app's brightness.
 */
export function CRTDisplay({
  node,
  film,
  reflections = 1,
  time,
  settle,
}: {
  /** The model's raster. */
  node: THREE.Mesh | null
  film: THREE.Texture | null
  /** How much of the room the glass reflects, 0 to 1. It drops at once and comes up over CRT.reflectionsRise. */
  reflections?: number
  /** Seconds, for a film that keeps its own time: the light follows each frame exactly instead of easing. */
  time?: number
  /** How much of the bow and scan to show, 1 to 0; a film flattens toward its end (settling). */
  settle?: () => number
}) {
  const uniforms = useMemo(
    () => ({
      crtSettle: { value: 1 },
      crtCurve: { value: CRT.curve },
      crtScan: { value: CRT.scan },
      crtLines: { value: CRT.lines },
      crtApp: { value: new THREE.Vector2(APP.width, APP.height) },
      crtRadius: { value: (screen.radius / (2 * screen.halfWidth)) * APP.width },
      crtEdge: { value: new THREE.Vector4(TUBE_EDGE.vignetteFrom, TUBE_EDGE.vignette, TUBE_EDGE.shadow, TUBE_EDGE.line) },
      crtShadow: { value: new THREE.Vector2(TUBE_EDGE.spread, TUBE_EDGE.blur) },
    }),
    [],
  )
  const material = useMemo(() => screenMaterial(uniforms), [uniforms])
  const halo = useMemo(
    () =>
      haloMaterial({
        haloHalf: { value: new THREE.Vector2(screen.halfWidth, screen.halfHeight) },
        haloRadius: { value: screen.radius },
        haloFalloff: { value: CRT.halo.falloff },
        haloColor: { value: new THREE.Color(0, 0, 0) },
      }),
    [],
  )
  const phosphor = useMemo(() => new THREE.Color(CRT.phosphor), [])
  const light = useRef<THREE.RectAreaLight>(null)
  const brightnessOf = useBrightness()
  const level = useRef({ now: 0, sampled: 0, frame: 0 })

  useLayoutEffect(() => {
    if (!node) return
    const was = node.material
    node.material = material
    return () => void (node.material = was)
  }, [node, material])

  useLayoutEffect(() => {
    if (film) {
      film.flipY = false
      film.colorSpace = THREE.SRGBColorSpace
      film.anisotropy = 8
      // A video with no frame yet cannot be uploaded; its own update takes the first one.
      const source = film.image as unknown
      if (!(source instanceof HTMLVideoElement) || source.readyState >= source.HAVE_CURRENT_DATA) film.needsUpdate = true
    }
    material.emissiveMap = film
    material.emissiveIntensity = film ? 1 : 0
    material.needsUpdate = true
  }, [film, material])

  useLayoutEffect(() => {
    light.current?.lookAt(lightTarget)
  }, [])

  useFrame((_, delta) => {
    const was = material.specularIntensity
    material.specularIntensity =
      reflections <= was ? reflections : Math.min(reflections, was + delta / CRT.reflectionsRise)
    uniforms.crtSettle.value = settle ? settle() : 1

    const state = level.current
    // A small copy of the picture every few frames is plenty for light that eases anyway.
    if (film && (time !== undefined || state.frame++ % 5 === 0)) state.sampled = brightnessOf(film.image) ?? state.sampled
    const target = film ? state.sampled : CRT.light.app
    state.now = time !== undefined ? target : state.now + (target - state.now) * Math.min(1, delta / CRT.light.follow)
    if (light.current) light.current.intensity = CRT.light.nits * state.now
    ;(halo.uniforms.haloColor!.value as THREE.Color).copy(phosphor).multiplyScalar(CRT.halo.strength * state.now)
  })

  const reach = CRT.halo.reach
  return (
    <>
      <mesh name="ScreenHalo" position={haloAt} quaternion={facing} material={halo} raycast={() => null} renderOrder={2}>
        <planeGeometry args={[2 * (screen.halfWidth + reach), 2 * (screen.halfHeight + reach)]} />
      </mesh>
      <rectAreaLight
        ref={light}
        name="ScreenLight"
        position={lightAt}
        width={2 * screen.halfWidth}
        height={2 * screen.halfHeight}
        color={CRT.phosphor}
        intensity={0}
      />
    </>
  )
}
