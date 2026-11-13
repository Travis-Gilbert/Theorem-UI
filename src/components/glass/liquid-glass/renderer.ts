// SOURCING: adapted from ybouane/liquidglass (MIT, src/GlassRenderer.ts): one offscreen WebGL context shared by every pane, a texture uploaded from a 2D crop of the scene, ping-pong framebuffers for the separable blur, the pane shaded into the shared canvas and copied into the pane's own canvas with drawImage, and context-loss handling. Changed here: the scene is the Life field's canvas over the sheet's own gradient, cropped with a margin and never captured from the DOM (no html-to-image); the blur runs at a half or quarter of the scene and its strength is a CSS-pixel radius; the pane renders at the display's density while the scene stays at CSS pixels.
import { FS_BLUR, FS_COPY, FS_GLASS, VS_QUAD } from './shaders'

export type Rgb = readonly [number, number, number]

/** One pane's material, as styles.css sets it (--lg-*). */
export interface Material {
  /** Blur of the body, a CSS-pixel radius. */
  blur: number
  /** How far the surface curves in from the edge, CSS pixels. */
  bevel: number
  /** How far the rim bends what is behind it, CSS pixels. */
  refract: number
  /** How much of the unblurred scene the very edge shows, 0 to 1. */
  clarity: number
  tone: Rgb
  /** How far the body settles toward the tone, 0 to 1. */
  body: number
  /** How far the edge settles toward the tone, 0 to 1. */
  rimBody: number
  /** Added to the body's colour, -1 to 1. */
  lift: number
  saturate: number
  light: number
  sheen: number
  stroke: number
  shade: number
  /** How much of what lies behind shows through the body unchanged, 0 to 1:
   *  the pane's own blur there is the browser's backdrop-filter, which sees
   *  the conversation as well as the field. The rim stays the pane's. */
  show: number
}

/** What a pane sits on: the sheet's gradient and the field drawn over it. */
export interface Scene {
  /** The Life field's canvas, when one is drawing. */
  field: HTMLCanvasElement | null
  fieldRect: DOMRect | null
  /** The sheet the gradient spans, in client pixels. */
  sheetTop: number
  sheetHeight: number
  /** --sheet-from and --sheet-shade. */
  from: Rgb
  shade: Rgb
}

export interface Pane {
  /** The pane's border box, in client pixels. */
  rect: DOMRect
  radius: number
  /** How far the bevel runs past each side, CSS pixels: left, top, right, bottom. */
  extend: readonly [number, number, number, number]
  dpr: number
  material: Material
  target: HTMLCanvasElement
}

interface Target {
  framebuffer: WebGLFramebuffer
  texture: WebGLTexture
  width: number
  height: number
}

const UNIFORMS = [
  'u_scene',
  'u_blur',
  'u_size',
  'u_sceneSize',
  'u_margin',
  'u_radius',
  'u_extend',
  'u_px',
  'u_bevel',
  'u_refract',
  'u_clarity',
  'u_tone',
  'u_body',
  'u_rimBody',
  'u_lift',
  'u_saturate',
  'u_light',
  'u_sheen',
  'u_stroke',
  'u_shade',
  'u_show',
] as const

type Uniforms = Record<(typeof UNIFORMS)[number], WebGLUniformLocation | null>

/** Room around the pane, so the rim's refraction and the blur read real pixels. */
const MARGIN = 32
const BLUR_PASSES = 4
/** The sheet's gradient (styles.css --sheet-field): shade's share at each stop. */
const SHEET_STOPS: ReadonlyArray<readonly [number, number]> = [
  [0, 0],
  [0.188, 0.11],
  [0.376, 0.25],
  [0.564, 0.43],
  [0.658, 0.54],
  [0.752, 0.67],
  [0.846, 0.82],
  [0.94, 1],
]

const css = ([r, g, b]: Rgb, weight: number, [r2, g2, b2]: Rgb) =>
  `rgb(${r + (r2 - r) * weight} ${g + (g2 - g) * weight} ${b + (b2 - b) * weight})`

export class GlassRenderer {
  private readonly canvas = document.createElement('canvas')
  private readonly gl: WebGLRenderingContext
  private readonly crop = document.createElement('canvas')
  private readonly cropContext: CanvasRenderingContext2D
  private copy!: { program: WebGLProgram; tex: WebGLUniformLocation | null }
  private blur!: {
    program: WebGLProgram
    tex: WebGLUniformLocation | null
    dir: WebGLUniformLocation | null
  }
  private glass!: {
    program: WebGLProgram
    u: Uniforms
  }
  private quad!: WebGLBuffer
  private sceneTexture!: WebGLTexture
  private readonly targets = new Map<string, [Target, Target]>()
  lost = false

  constructor(onLost: (lost: boolean) => void) {
    const gl = this.canvas.getContext('webgl', {
      alpha: true,
      premultipliedAlpha: false,
      antialias: false,
      preserveDrawingBuffer: true,
    })
    const context = this.crop.getContext('2d')
    if (!gl || !context) throw new Error('liquid glass: no WebGL')
    this.gl = gl
    this.cropContext = context
    this.init()
    this.canvas.addEventListener('webglcontextlost', (event) => {
      event.preventDefault()
      this.lost = true
      onLost(true)
    })
    this.canvas.addEventListener('webglcontextrestored', () => {
      this.targets.clear()
      this.init()
      this.lost = false
      onLost(false)
    })
  }

  private init() {
    const gl = this.gl
    const copy = this.link(FS_COPY)
    this.copy = { program: copy, tex: gl.getUniformLocation(copy, 'u_tex') }
    const blur = this.link(FS_BLUR)
    this.blur = {
      program: blur,
      tex: gl.getUniformLocation(blur, 'u_tex'),
      dir: gl.getUniformLocation(blur, 'u_dir'),
    }
    const glass = this.link(FS_GLASS)
    this.glass = {
      program: glass,
      u: Object.fromEntries(
        UNIFORMS.map((name) => [name, gl.getUniformLocation(glass, name)]),
      ) as Uniforms,
    }
    const quad = gl.createBuffer()
    this.quad = quad
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]),
      gl.STATIC_DRAW,
    )
    this.sceneTexture = this.texture()
  }

  /** Shades one pane into its canvas. */
  render(pane: Pane, scene: Scene) {
    if (this.lost) return
    const gl = this.gl
    const { rect, material, dpr } = pane
    const width = Math.max(1, Math.round(rect.width))
    const height = Math.max(1, Math.round(rect.height))
    const sceneWidth = width + MARGIN * 2
    const sceneHeight = height + MARGIN * 2
    this.paintScene(rect, sceneWidth, sceneHeight, scene)

    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture)
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      this.crop,
    )
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false)

    // The body's blur, on a smaller copy: cheaper, and smoother per tap.
    const scale = material.blur > 10 ? 4 : 2
    const blurWidth = Math.max(1, Math.ceil(sceneWidth / scale))
    const blurHeight = Math.max(1, Math.ceil(sceneHeight / scale))
    const [a, b] = this.pingPong(blurWidth, blurHeight)
    gl.useProgram(this.copy.program)
    gl.activeTexture(gl.TEXTURE0)
    gl.uniform1i(this.copy.tex, 0)
    this.draw(a, this.sceneTexture, this.copy.program)
    // Each pass is a Gaussian of 1.7 taps; four passes add to 3.4 taps.
    const spread = material.blur / scale / (1.7 * Math.sqrt(BLUR_PASSES))
    if (spread > 0) {
      gl.useProgram(this.blur.program)
      gl.uniform1i(this.blur.tex, 0)
      for (let i = 0; i < BLUR_PASSES; i++) {
        gl.uniform2f(this.blur.dir, spread / blurWidth, 0)
        this.draw(b, a.texture, this.blur.program)
        gl.uniform2f(this.blur.dir, 0, spread / blurHeight)
        this.draw(a, b.texture, this.blur.program)
      }
    }

    const outWidth = Math.max(1, Math.round(width * dpr))
    const outHeight = Math.max(1, Math.round(height * dpr))
    if (this.canvas.width < outWidth) this.canvas.width = outWidth
    if (this.canvas.height < outHeight) this.canvas.height = outHeight
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    gl.viewport(0, 0, outWidth, outHeight)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    const { program, u } = this.glass
    gl.useProgram(program)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTexture)
    gl.uniform1i(u.u_scene, 0)
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, a.texture)
    gl.uniform1i(u.u_blur, 1)
    gl.uniform2f(u.u_size, width, height)
    gl.uniform2f(u.u_sceneSize, sceneWidth, sceneHeight)
    gl.uniform1f(u.u_margin, MARGIN)
    gl.uniform1f(u.u_radius, pane.radius)
    gl.uniform4f(u.u_extend, ...pane.extend)
    gl.uniform1f(u.u_px, 1 / dpr)
    gl.uniform1f(u.u_bevel, material.bevel)
    gl.uniform1f(u.u_refract, material.refract)
    gl.uniform1f(u.u_clarity, material.clarity)
    gl.uniform3f(
      u.u_tone,
      material.tone[0] / 255,
      material.tone[1] / 255,
      material.tone[2] / 255,
    )
    gl.uniform1f(u.u_body, material.body)
    gl.uniform1f(u.u_rimBody, material.rimBody)
    gl.uniform1f(u.u_lift, material.lift)
    gl.uniform1f(u.u_saturate, material.saturate)
    gl.uniform1f(u.u_light, material.light)
    gl.uniform1f(u.u_sheen, material.sheen)
    gl.uniform1f(u.u_stroke, material.stroke)
    gl.uniform1f(u.u_shade, material.shade)
    gl.uniform1f(u.u_show, material.show)
    this.quadDraw(program)
    gl.activeTexture(gl.TEXTURE0)

    const target = pane.target
    if (target.width !== outWidth) target.width = outWidth
    if (target.height !== outHeight) target.height = outHeight
    const context = target.getContext('2d')
    if (!context) return
    context.clearRect(0, 0, outWidth, outHeight)
    // The pane sits at the bottom left of the shared canvas (GL's origin).
    context.drawImage(
      this.canvas,
      0,
      this.canvas.height - outHeight,
      outWidth,
      outHeight,
      0,
      0,
      outWidth,
      outHeight,
    )
  }

  /** The sheet's gradient behind the pane, the field over it, in CSS pixels. */
  private paintScene(
    rect: DOMRect,
    width: number,
    height: number,
    scene: Scene,
  ) {
    const crop = this.crop
    const context = this.cropContext
    if (crop.width !== width) crop.width = width
    if (crop.height !== height) crop.height = height
    const left = rect.left - MARGIN
    const top = rect.top - MARGIN
    const gradient = context.createLinearGradient(
      0,
      scene.sheetTop - top,
      0,
      scene.sheetTop - top + scene.sheetHeight,
    )
    for (const [at, weight] of SHEET_STOPS)
      gradient.addColorStop(at, css(scene.from, weight, scene.shade))
    context.fillStyle = gradient
    context.fillRect(0, 0, width, height)

    const { field, fieldRect } = scene
    if (!field || !fieldRect || fieldRect.width < 1 || fieldRect.height < 1)
      return
    const sx = field.width / fieldRect.width
    const sy = field.height / fieldRect.height
    // Only the part of the crop the field covers; past it, the gradient stays.
    const x0 = Math.max(left, fieldRect.left)
    const y0 = Math.max(top, fieldRect.top)
    const x1 = Math.min(left + width, fieldRect.right)
    const y1 = Math.min(top + height, fieldRect.bottom)
    if (x1 <= x0 || y1 <= y0) return
    context.drawImage(
      field,
      (x0 - fieldRect.left) * sx,
      (y0 - fieldRect.top) * sy,
      (x1 - x0) * sx,
      (y1 - y0) * sy,
      x0 - left,
      y0 - top,
      x1 - x0,
      y1 - y0,
    )
  }

  private pingPong(width: number, height: number): [Target, Target] {
    const key = `${width}x${height}`
    let pair = this.targets.get(key)
    if (!pair) {
      // A handful of pane sizes is normal; a resize drag makes many.
      if (this.targets.size > 12) this.flush()
      pair = [this.target(width, height), this.target(width, height)]
      this.targets.set(key, pair)
    }
    return pair
  }

  private flush() {
    const gl = this.gl
    for (const pair of this.targets.values())
      for (const target of pair) {
        gl.deleteFramebuffer(target.framebuffer)
        gl.deleteTexture(target.texture)
      }
    this.targets.clear()
  }

  private texture() {
    const gl = this.gl
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    return texture
  }

  private target(width: number, height: number): Target {
    const gl = this.gl
    const texture = this.texture()
    gl.texImage2D(
      gl.TEXTURE_2D,
      0,
      gl.RGBA,
      width,
      height,
      0,
      gl.RGBA,
      gl.UNSIGNED_BYTE,
      null,
    )
    const framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(
      gl.FRAMEBUFFER,
      gl.COLOR_ATTACHMENT0,
      gl.TEXTURE_2D,
      texture,
      0,
    )
    gl.bindFramebuffer(gl.FRAMEBUFFER, null)
    return { framebuffer, texture, width, height }
  }

  private draw(into: Target, from: WebGLTexture, program: WebGLProgram) {
    const gl = this.gl
    gl.bindFramebuffer(gl.FRAMEBUFFER, into.framebuffer)
    gl.viewport(0, 0, into.width, into.height)
    gl.bindTexture(gl.TEXTURE_2D, from)
    this.quadDraw(program)
  }

  private quadDraw(program: WebGLProgram) {
    const gl = this.gl
    const position = gl.getAttribLocation(program, 'a_pos')
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private link(fragment: string) {
    const gl = this.gl
    const program = gl.createProgram()
    for (const [type, source] of [
      [gl.VERTEX_SHADER, VS_QUAD],
      [gl.FRAGMENT_SHADER, fragment],
    ] as const) {
      const shader = gl.createShader(type)
      if (!shader) throw new Error('liquid glass: no shader')
      gl.shaderSource(shader, source)
      gl.compileShader(shader)
      if (
        !gl.getShaderParameter(shader, gl.COMPILE_STATUS) &&
        !gl.isContextLost()
      )
        throw new Error(
          `liquid glass: ${gl.getShaderInfoLog(shader) ?? 'shader failed'}`,
        )
      gl.attachShader(program, shader)
    }
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost())
      throw new Error(
        `liquid glass: ${gl.getProgramInfoLog(program) ?? 'link failed'}`,
      )
    return program
  }
}
