// SOURCING: @paper-design/shaders (Paper Design's PaperTexture fragment shader, run by its vanilla
// ShaderMount with its own noise texture, colour parser and fit options). Paper's React component
// mounts a live canvas per instance and throws inside an effect when WebGL2 is missing, so the bake
// drives the mount it wraps. Ours is only the bake: one tile, copied to an image, context released.
import {
  emptyPixel,
  getShaderColorFromString,
  getShaderNoiseTexture,
  paperTextureFragmentShader,
  ShaderFitOptions,
  ShaderMount,
} from '@paper-design/shaders'
import type { PaperTextureUniforms } from '@paper-design/shaders'

/** The tile's CSS size; styles.css repeats the mask at this size. Rendered at twice it. */
const TILE = 512

/**
 * Feeds `--paper-texture`, the mask the surface-paper utilities paint their grain through, when
 * the page cannot bake one: SVG fractal noise stitched to tile, its red channel taken as alpha and
 * scaled to the baked tile's coverage (an eighth on average, varying by about half that, almost
 * none of it clear).
 */
const FALLBACK = `url("data:image/svg+xml,${encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='${TILE}' height='${TILE}'><filter id='g'><feTurbulence type='fractalNoise' baseFrequency='0.35' numOctaves='3' stitchTiles='stitch'/><feColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.6 0 0 0 -0.17'/></filter><rect width='100%' height='100%' filter='url(#g)'/></svg>`,
)}")`

/**
 * A smooth sheet: mostly fiber, a little grain, both at a broad size, and nothing else (folds,
 * wrinkles, crumples, drops and distortion are off). The shader clamps its pattern at zero, so
 * strong fine grain leaves bare paper between hard specks, which reads as sandpaper. Fiber is
 * never negative, so with it carrying the pattern the tile is one continuous tone with no clipped
 * flats. Paper and backdrop are clear and the pattern is opaque black, so the tile's alpha is the
 * grain and the utilities choose its colour per palette. The image is Paper's empty pixel: the shader
 * sizes the sheet by the image's aspect ratio, which is never set without one.
 */
function grainUniforms(noise: HTMLImageElement, pixel: HTMLImageElement) {
  const clear = getShaderColorFromString('#00000000')
  return {
    u_image: pixel,
    u_isImage: false,
    u_colorBack: clear,
    u_colorPaper: clear,
    u_colorShadow: getShaderColorFromString('#000000'),
    u_blending: 0,
    u_distortion: 0,
    u_clip: false,
    u_angle: 0,
    u_seed: 7,
    u_roughness: 0.12,
    u_roughnessSize: 0.7,
    u_roughnessRows: 0,
    u_fiber: 0.45,
    u_fiberSize: 0.7,
    u_folds: 0,
    u_foldSizeX: 0,
    u_foldSizeY: 0,
    u_foldOffsetX: 0,
    u_foldOffsetY: 0,
    u_wrinkles: 0,
    u_wrinkleSize: 0,
    u_crumples: 0,
    u_crumpleCount: 2,
    u_drops: 0,
    u_noiseTexture: noise,
    u_fit: ShaderFitOptions.cover,
    u_scale: 1,
    u_rotation: 0,
    u_originX: 0.5,
    u_originY: 0.5,
    u_offsetX: 0,
    u_offsetY: 0,
    u_worldWidth: 0,
    u_worldHeight: 0,
  } satisfies PaperTextureUniforms
}

/** Renders one tile in a WebGL2 context that lives only as long as the render, and returns it as a PNG. */
async function bake(): Promise<Blob> {
  const noise = getShaderNoiseTexture()
  if (!noise) throw new Error('no window')
  const pixel = new Image()
  pixel.src = emptyPixel
  await Promise.all([noise.decode(), pixel.decode()])

  // The shader sizes its grain in canvas pixels, so the tile has to be the same canvas on every
  // display: the host is the tile's pixel size and the pixel budget holds the canvas to it.
  const pixels = TILE * 2
  const host = document.createElement('div')
  host.style.cssText = `position:fixed;left:${-2 * pixels}px;top:0;width:${pixels}px;height:${pixels}px;pointer-events:none;contain:strict`
  document.body.append(host)
  let mount: ShaderMount | undefined
  try {
    // Throws without WebGL2.
    mount = new ShaderMount(
      host,
      paperTextureFragmentShader,
      grainUniforms(noise, pixel),
      { preserveDrawingBuffer: true },
      0,
      0,
      1,
      pixels ** 2,
    )
    const { canvasElement } = mount
    // The mount renders in its own ResizeObserver callback. Observers run in the order they were
    // made, so when this one fires the tile is drawn. In a background tab that waits for the first
    // painted frame, and so does the grain.
    await new Promise<void>((resolve) => {
      const observer = new ResizeObserver(() => {
        observer.disconnect()
        // Encoding and disposal can affect canvas layout in WebKit.
        requestAnimationFrame(() => resolve())
      })
      observer.observe(host)
    })
    return await new Promise<Blob>((resolve, reject) =>
      canvasElement.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('empty tile'))), 'image/png'),
    )
  } finally {
    mount?.dispose()
    host.remove()
  }
}

let applied: Promise<void> | undefined

/**
 * Bakes the paper grain once per page and hands it to every surface-paper element through
 * `--paper-texture` on the root, falling back to SVG noise where WebGL2 is missing.
 */
export function applyPaperTexture(): Promise<void> {
  applied ??= bake().then(
    (blob) => `url("${URL.createObjectURL(blob)}")`,
    () => FALLBACK,
  ).then((texture) => {
    document.documentElement.style.setProperty('--paper-texture', texture)
  })
  return applied
}
