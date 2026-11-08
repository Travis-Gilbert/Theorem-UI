// SOURCING: @react-three/fiber and @react-three/drei (useGLTF, useTexture, Environment, Lightformer, ContactShadows, RoundedBox) over three's physical materials and RectAreaLight for the windows; the tube is crt.tsx; its own transmission is the liquid glass, because it refracts at full resolution where drei's MeshTransmissionMaterial broke up glyphs this small in its fixed buffer. The room's arrangement is ours; site/study/build_study.py models the props because nothing licensed and accurate exists (evidence/LEDGER.md).
import { useLayoutEffect, useMemo } from 'react'
import type { ReactNode } from 'react'
import {
  ContactShadows,
  Environment,
  Lightformer,
  RoundedBox,
  useGLTF,
  useTexture,
} from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import type { ThreeElements } from '@react-three/fiber'
import * as THREE from 'three'
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js'
import { CRTDisplay } from './crt'
import layout from './layout.json'

// The windows' light is three's rect area light, which needs its lookup tables once.
RectAreaLightUniformsLib.init()

const PAPER = '#F1F3F5'
/** The palette's raised slate, a little greyer as a material: under this much cool light its own colour reads navy. */
const SLATE = '#3A3F49'
const BRASS_LIGHT = '#ffe4c4'

/**
 * The computer, keyboard and mouse wear the owner's photograph where its lens saw them (study/build_study.py
 * projects it). `own` is how much of the photograph shows as taken, `lit` how much the room's light adds on top.
 */
const PHOTO = { own: 0.62, lit: 0.42 }
/** The faces the photograph did not see take the same light, in the plastic's colour as the photograph shows it. */
const PHOTO_PLASTIC: Record<string, string> = {
  ivory: '#b8ada5',
  ivory_key: '#b3a99e',
  ivory_shadow: '#7d756b',
}

const { pier, casing } = layout.room
/**
 * Where the Life falls on the back wall, in metres in the room: across the pier between the windows, over the canvas
 * hung on it, and fading out across the casings and toward the ceiling, the way a projection's edge falls off.
 * One CSS pixel of field per 1/FIELD_PX_PER_M metres.
 */
export const FIELD = {
  x0: pier.x0 - casing.width - 0.03,
  x1: pier.x1 + casing.width + 0.03,
  y0: 0,
  y1: 1.25,
  fade: 0.13,
}
export const FIELD_PX_PER_M = 1110
/** The parts of the model the Life lies on, so a pointer over them paints and one over anything else does not. */
export const FIELD_ON = new Set(['Wall', 'Canvas', 'Casings'])

export interface RoomAssets {
  glb: string
  covers: { dream: string; hamming: string; everyone: string }
  slate: string
  ripple: string
  /** The casings' stained fir, the shades' reed, the canvas's own image, the notebook's written page (study/textures.py). */
  wood: string
  weave: string
  canvas: string
  notebook: string
}

export const ROOM_ASSETS: RoomAssets = {
  glb: '/study/study.glb',
  covers: {
    dream: '/study/covers/dream.jpg',
    hamming: '/study/covers/hamming.jpg',
    everyone: '/study/covers/everyone.jpg',
  },
  slate: '/study/slate.jpg',
  ripple: '/study/ripple.jpg',
  wood: '/study/wood.jpg',
  weave: '/study/weave.jpg',
  canvas: '/study/canvas.jpg',
  notebook: '/study/notebook.jpg',
}

/** The liquid glass over the Life. `drift` is how far its swells travel, in tiles a second. */
export const GLASS = {
  thickness: 0.06,
  roughness: 0.03,
  ior: 1.3,
  dispersion: 1.2,
  swell: 0.5,
  drift: 0.012,
}

/**
 * Everything in the room stands in front of the glass, and three refracts whatever
 * is in its opaque pass, so a lamp arm would smear into the glass beside itself.
 * At full opacity "transparent" only moves a material out of that pass: the glass
 * sees the wall and nothing else, and the extra pass costs two planes.
 */
const IN_FRONT_OF_GLASS = true

/** The slate runs past the edges of every frame, so no shot sees where it ends. Blender places the props on the part it models. */
const DESK_REACH = { x0: -2.6, x1: 2.6, front: 2.4 }

/** Metres of wall per tile of the glass's ripple map. */
const SWELL_TILE = 1.2
/** The glass hangs clear of the desk, so the desk's far edge is not seen through it. */
const GLASS_CLEARANCE = 0.03

/** Daylight through the shades: the gaps between the reeds glow, the reeds a little. */
const DAYLIGHT = '#dfe8f6'
const SHADE_GLOW = 0.55
/**
 * The windows behind the shades, as light into the room: the left one is the room's daylight and the right one, on the
 * lamp's side, a little of it. Luminance in nits; the shades let through a share of the sky.
 */
const WINDOW_LIGHT = { left: 2.4, right: 1.0 }
/**
 * The light on the pier comes from the left window, so it falls off toward the lamp: a wash from the left, high,
 * across the paper, cooler than the lamp, with no shadow of its own.
 */
const WALL_WASH = { position: [-1.0, 1.75, 0.55] as const, target: [0.35, 0.3] as const, intensity: 6.2, color: '#eef3fb' }
/** The lamp's pool, the one warm light in the room, and how hard the props stand on the desk. */
const LAMP = { intensity: 3.4, angle: 0.62, penumbra: 0.9 }
const CONTACT = { opacity: 0.8, blur: 1.6, far: 0.26 }
/** Glass over the slate, as on the owner's desk: a clear coat that catches the windows, the stone under it still matte. */
const DESK_GLASS = { clearcoat: 0.3, clearcoatRoughness: 0.3 }

/** The canvas is lit like the wall it hangs on, but its colour stays a step behind the computer in front of it. */
const CANVAS_TONE = '#a3a5a1'
/** Over the canvas and the wood the Life is a trace of projected light, fainter than on the paper. */
const ON_PICTURES = 0.45

type FieldUniforms = {
  fieldMap: { value: THREE.Texture | null }
  fieldRect: { value: THREE.Vector4 }
  fieldFade: { value: THREE.Vector2 }
  fieldOpacity: { value: number }
}

/**
 * Lays the Life over a material by where its surface is on the wall, not by its UVs, so the wall, the canvas and the
 * casings take one picture across them. On the paper the glyphs replace the paper the way they always have (the
 * field's canvas is clear between glyphs and its faded cells fade toward paper); on the canvas and the wood they
 * multiply, a projection over what is already there.
 */
function projectField(
  material: THREE.MeshStandardMaterial,
  uniforms: FieldUniforms,
  blend: 'replace' | 'multiply',
  strength = 1,
) {
  material.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, uniforms)
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec2 vFieldAt;')
      .replace('#include <project_vertex>', '#include <project_vertex>\nvFieldAt = (modelMatrix * vec4(transformed, 1.0)).xy;')
    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
        varying vec2 vFieldAt;
        uniform sampler2D fieldMap;
        uniform vec4 fieldRect;
        uniform vec2 fieldFade;
        uniform float fieldOpacity;`,
      )
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          vec2 at = (vFieldAt - fieldRect.xy) / fieldRect.zw;
          vec2 edge = smoothstep(vec2(0.0), fieldFade, at) * smoothstep(vec2(0.0), fieldFade, 1.0 - at);
          vec4 field = texture2D(fieldMap, clamp(at, 0.0, 1.0));
          float share = field.a * fieldOpacity * ${strength.toFixed(3)} * edge.x * edge.y;
          diffuseColor.rgb = mix(diffuseColor.rgb, ${blend === 'replace' ? 'field.rgb' : 'diffuseColor.rgb * field.rgb'}, share);
        }`,
      )
  }
  material.customProgramCacheKey = () => `field-${blend}-${strength}`
  material.needsUpdate = true
}

export function StudyRoom({
  assets,
  film,
  reflections = 1,
  field,
  fieldOpacity = 0.84,
  glass = GLASS,
  time,
  settle,
  events,
  children,
}: {
  assets: RoomAssets
  /** What plays on the tube. */
  film: THREE.Texture | null
  /** How much of the room the tube's glass reflects, 0 to 1 (crt.tsx). */
  reflections?: number
  /** How much of the tube's bow to show, 1 to 0: a film flattens toward its end (crt.tsx settling). */
  settle?: () => number
  /** The Life, already drawn: live from the site's field or from the film's seeded run. */
  field: THREE.Texture | null
  fieldOpacity?: number
  /** Null takes the glass off, to compare. */
  glass?: typeof GLASS | null
  /** Seconds, for a film that keeps its own time. The live room uses the clock. */
  time?: number
  /** Pointer handlers for the model, so its parts can be selected. */
  events?: Partial<Pick<ThreeElements['group'], 'onPointerMove' | 'onPointerOut' | 'onClick'>>
  children?: ReactNode
}) {
  const { scene } = useGLTF(assets.glb)
  const covers = useTexture(assets.covers)
  const slate = useTexture(assets.slate)
  const ripple = useTexture(assets.ripple)
  const surfaces = useTexture({ wood: assets.wood, weave: assets.weave, canvas: assets.canvas, notebook: assets.notebook })
  const fieldUniforms = useMemo<FieldUniforms>(
    () => ({
      fieldMap: { value: null },
      fieldRect: { value: new THREE.Vector4(FIELD.x0, FIELD.y0, FIELD.x1 - FIELD.x0, FIELD.y1 - FIELD.y0) },
      fieldFade: { value: new THREE.Vector2(FIELD.fade / (FIELD.x1 - FIELD.x0), FIELD.fade / (FIELD.y1 - FIELD.y0)) },
      fieldOpacity: { value: fieldOpacity },
    }),
    [],
  )
  fieldUniforms.fieldOpacity.value = fieldOpacity

  const screenNode = useMemo(() => (scene.getObjectByName('Screen') as THREE.Mesh | undefined) ?? null, [scene])

  useLayoutEffect(() => {
    const byName: Record<string, THREE.Texture> = {
      cover_dream: covers.dream,
      cover_hamming: covers.hamming,
      cover_everyone: covers.everyone,
    }
    // study/build_study.py lays the casings' and shades' UVs in tiles of their maps, so those maps only repeat.
    // The canvas and the page keep three's flip: their UVs run up the image, as Blender's do.
    for (const texture of Object.values(surfaces)) {
      texture.colorSpace = THREE.SRGBColorSpace
      texture.anisotropy = 8
      texture.needsUpdate = true
    }
    const { wood, weave } = surfaces
    wood.wrapS = wood.wrapT = weave.wrapS = weave.wrapT = THREE.RepeatWrapping
    scene.traverse((node) => {
      if (!(node instanceof THREE.Mesh)) return
      node.castShadow = node.name !== 'Screen' && node.name !== 'Wall'
      node.receiveShadow = true
      for (const material of [node.material].flat() as THREE.MeshStandardMaterial[]) {
        // The wall is behind the glass and the only thing it should refract, so it stays in the opaque pass.
        material.transparent = IN_FRONT_OF_GLASS && material.name !== 'wall'
        if (material.name === 'wall') {
          material.color = new THREE.Color(PAPER)
          material.roughness = 0.92
          projectField(material, fieldUniforms, 'replace')
        }
        if (material.name === 'wood') {
          material.map = wood
          material.color = new THREE.Color('#ffffff')
          material.roughness = 0.55
          projectField(material, fieldUniforms, 'multiply', ON_PICTURES)
        }
        if (material.name === 'canvas_art') {
          material.map = surfaces.canvas
          material.color = new THREE.Color(CANVAS_TONE)
          projectField(material, fieldUniforms, 'multiply', ON_PICTURES)
        }
        if (material.name === 'weave') {
          material.map = weave
          material.color = new THREE.Color('#ffffff')
          material.emissive = new THREE.Color(DAYLIGHT)
          material.emissiveMap = weave
          material.emissiveIntensity = SHADE_GLOW
          material.side = THREE.DoubleSide
          material.needsUpdate = true
        }
        if (material.name === 'notebook_page') {
          material.map = surfaces.notebook
          material.color = new THREE.Color('#ffffff')
          material.needsUpdate = true
        }
        const cover = byName[material.name]
        if (cover) {
          // The GLB's UVs follow glTF's convention: top row first.
          cover.flipY = false
          cover.colorSpace = THREE.SRGBColorSpace
          cover.anisotropy = 8
          cover.needsUpdate = true
          material.map = cover
          material.needsUpdate = true
        }
        if (material.name === 'bulb') {
          material.emissive = new THREE.Color(BRASS_LIGHT)
          material.emissiveIntensity = 2.2
        }
        const plastic = PHOTO_PLASTIC[material.name]
        if (plastic) {
          material.emissive = new THREE.Color(plastic)
          material.emissiveIntensity = PHOTO.own
          material.color = new THREE.Color(plastic).multiplyScalar(PHOTO.lit)
          material.needsUpdate = true
        }
        if (material.name === 'photo') {
          // The photograph already holds its own light, so most of it shows as it was taken and the room adds a share.
          material.emissive = new THREE.Color('#ffffff')
          material.emissiveMap = material.map
          material.emissiveIntensity = PHOTO.own
          material.color = new THREE.Color().setScalar(PHOTO.lit)
          material.roughness = 0.5
          material.needsUpdate = true
        }
      }
    })
  }, [scene, covers, surfaces, fieldUniforms])

  const { wall, lamp } = layout
  const windows = layout.room.windows.map((window) => ({
    x: window.center[0] as number,
    z: window.center[2] as number,
    width: window.width,
  }))
  const desk = { ...layout.desk, ...DESK_REACH }
  const deskWidth = desk.x1 - desk.x0
  const deskDepth = desk.front - desk.back
  const lampTarget = useMemo(() => {
    const target = new THREE.Object3D()
    target.position.fromArray(lamp.target)
    return target
  }, [lamp.target])
  const wallCentre = useMemo(() => {
    const target = new THREE.Object3D()
    target.position.set(WALL_WASH.target[0], WALL_WASH.target[1], wall.z)
    return target
  }, [wall.z])
  const deskX = (desk.x0 + desk.x1) / 2
  const deskZ = (desk.front + desk.back) / 2
  useLayoutEffect(() => {
    slate.wrapS = slate.wrapT = THREE.RepeatWrapping
    // One tile per 0.8 m; the file's long cleft runs along the desk.
    slate.repeat.set(deskWidth / 0.8, deskDepth / 0.8)
    slate.colorSpace = THREE.NoColorSpace
    slate.anisotropy = 8
    slate.needsUpdate = true
  }, [slate, deskWidth, deskDepth])
  useLayoutEffect(() => {
    fieldUniforms.fieldMap.value = field
  }, [fieldUniforms, field])
  const glassWidth = pier.x1 - pier.x0
  const glassHeight = FIELD.y1 - GLASS_CLEARANCE
  useLayoutEffect(() => {
    ripple.wrapS = ripple.wrapT = THREE.RepeatWrapping
    ripple.repeat.set(glassWidth / SWELL_TILE, glassHeight / SWELL_TILE)
    ripple.colorSpace = THREE.NoColorSpace
    ripple.needsUpdate = true
  }, [ripple, glassWidth, glassHeight])
  useFrame((state) => {
    ripple.offset.x = (time ?? state.clock.elapsedTime) * (glass?.drift ?? 0)
  })

  return (
    <>
      <Environment resolution={256} frames={1} environmentIntensity={0.74}>
        <Lightformer form="rect" intensity={2.6} color="#f4f7fb" position={[0, 2.4, 0.6]} rotation-x={Math.PI / 2} scale={[4.2, 2.6, 1]} />
        <Lightformer form="rect" intensity={1.3} color="#e6ebf3" position={[-2.6, 1.1, 1.6]} rotation-y={Math.PI / 2.6} scale={[2.6, 2.2, 1]} />
        <Lightformer form="rect" intensity={0.8} color="#f7efe2" position={[2.8, 0.8, 1.8]} rotation-y={-Math.PI / 2.8} scale={[2, 2, 1]} />
        <Lightformer form="rect" intensity={0.55} color="#f1f3f5" position={[0, 0.8, 3.4]} rotation-y={Math.PI} scale={[5, 2.4, 1]} />
        <Lightformer form="rect" intensity={0.5} color="#f1f3f5" position={[0, 1, -2.4]} scale={[6, 3, 1]} />
        {/* The two windows, so the glass on the desk and the tube's bezel catch them where they are. */}
        {windows.map((window, i) => (
          <Lightformer
            key={i}
            form="rect"
            intensity={i === 0 ? 0.9 : 0.45}
            color={DAYLIGHT}
            position={[window.x, 0.9, window.z]}
            scale={[window.width, 1.6, 1]}
          />
        ))}
      </Environment>
      {windows.map((window, i) => (
        <rectAreaLight
          key={i}
          position={[window.x, 0.9, window.z + 0.005]}
          rotation-y={Math.PI}
          width={window.width}
          height={1.6}
          intensity={i === 0 ? WINDOW_LIGHT.left : WINDOW_LIGHT.right}
          color={DAYLIGHT}
        />
      ))}

      {/* The cool key, high and to the left, so the books and lamp shadow toward the right of the frame. */}
      <directionalLight
        position={[-1.15, 1.95, 1.55]}
        intensity={2.1}
        color="#f5f6f8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.00025}
        shadow-normalBias={0.002}
        shadow-camera-left={-1.2}
        shadow-camera-right={1.2}
        shadow-camera-top={1}
        shadow-camera-bottom={-1}
        shadow-camera-near={0.5}
        shadow-camera-far={5}
      />
      {/* The window's light across the paper, so the wall reads as paper and the Life has something to sit on. */}
      <primitive object={wallCentre} />
      <spotLight
        position={[...WALL_WASH.position]}
        target={wallCentre}
        angle={0.9}
        penumbra={1}
        intensity={WALL_WASH.intensity}
        distance={5}
        decay={1.4}
        color={WALL_WASH.color}
      />
      {/* The brass lamp's pool, warm on the slate. */}
      <primitive object={lampTarget} />
      <spotLight
        position={lamp.position as [number, number, number]}
        target={lampTarget}
        angle={LAMP.angle}
        penumbra={LAMP.penumbra}
        intensity={LAMP.intensity}
        distance={2.4}
        decay={1.6}
        color={BRASS_LIGHT}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-bias={-0.0004}
      />

      {/* The handlers sit on a group of this mount's own: on the cached model itself, a remount's cleanup could unregister the object the new mount had just registered. */}
      <group {...events}>
        <primitive object={scene} />
      </group>
      <CRTDisplay node={screenNode} film={film} reflections={reflections} time={time} settle={settle} />

      {/* The slate, under its glass. */}
      <RoundedBox
        args={[deskWidth, desk.thick, deskDepth]}
        radius={0.005}
        smoothness={3}
        position={[deskX, -desk.thick / 2 - 0.0005, deskZ]}
        renderOrder={-2}
        receiveShadow
      >
        <meshStandardMaterial color={SLATE} roughness={0.72} metalness={0} transparent={IN_FRONT_OF_GLASS} />
      </RoundedBox>
      <mesh position={[deskX, 0, deskZ]} rotation-x={-Math.PI / 2} renderOrder={-1} receiveShadow>
        <planeGeometry args={[deskWidth - 0.012, deskDepth - 0.012]} />
        <meshPhysicalMaterial
          color={SLATE}
          map={slate}
          roughnessMap={slate}
          bumpMap={slate}
          bumpScale={0.35}
          roughness={0.82}
          metalness={0}
          clearcoat={DESK_GLASS.clearcoat}
          clearcoatRoughness={DESK_GLASS.clearcoatRoughness}
          transparent={IN_FRONT_OF_GLASS}
        />
      </mesh>
      {/* Only over the part the props stand on, so its buffer stays fine. */}
      <ContactShadows
        position={[0, 0.0012, (layout.desk.front + layout.desk.back) / 2]}
        scale={[layout.desk.x1 - layout.desk.x0, layout.desk.front - layout.desk.back]}
        resolution={1024}
        blur={CONTACT.blur}
        far={CONTACT.far}
        opacity={CONTACT.opacity}
        color="#080b12"
        frames={1}
      />

      {glass && (
        // Over the pier, between the casings, under the canvas. The pointer goes straight through it to the wall.
        <mesh
          position={[(pier.x0 + pier.x1) / 2, GLASS_CLEARANCE + glassHeight / 2, wall.z + 0.02]}
          raycast={() => null}
        >
          <planeGeometry args={[glassWidth, glassHeight]} />
          <meshPhysicalMaterial
            transmission={1}
            thickness={glass.thickness}
            roughness={glass.roughness}
            ior={glass.ior}
            dispersion={glass.dispersion}
            normalMap={ripple}
            normalScale={[glass.swell, glass.swell]}
            specularIntensity={0}
          />
        </mesh>
      )}
      {children}
    </>
  )
}
