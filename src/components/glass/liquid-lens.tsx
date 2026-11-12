// SOURCING: WebGL 1 (one quad, one program) and a 2D canvas to crop the Life field; the lens's shading (rounded-rect SDF, a pill bevel's height field and its normal, two-surface refraction, colour split along the normal, Fresnel, Blinn-Phong specular, a top-lit inner stroke) follows ybouane/liquidglass's FS_GLASS (MIT), reworked to draw only the field and the light over a CSS frost rather than an opaque pane over a DOM snapshot. The numbers come from styles.css (--liquid-*).
import { useEffect, useRef } from 'react'
import type { FC } from 'react'

/** Field beyond the lens's edge it may bend in, in CSS pixels. */
const MARGIN = 24

const VERTEX = `
attribute vec2 a_uv;
uniform vec2 u_size;
varying vec2 v_px;
void main() {
  v_px = (a_uv - 0.5) * u_size;
  gl_Position = vec4(a_uv.x * 2.0 - 1.0, 1.0 - a_uv.y * 2.0, 0.0, 1.0);
}`

const FRAGMENT = `
precision highp float;
uniform sampler2D u_field;
uniform vec2 u_size;
uniform float u_radius;
uniform float u_margin;
uniform float u_refract;
uniform float u_bevel;
uniform float u_chroma;
uniform float u_gain;
uniform float u_frost;
uniform float u_spec;
uniform float u_rim;
uniform float u_shade;
uniform vec3 u_light;
uniform vec3 u_sheet;
varying vec2 v_px;

float rrect(vec2 p, vec2 b, float r) {
  vec2 q = abs(p) - b + vec2(r);
  return min(max(q.x, q.y), 0.0) + length(max(q, vec2(0.0))) - r;
}

float bevel(float d, float z) {
  if (d <= 0.0) return 0.0;
  if (d >= z) return z;
  return sqrt(d * (2.0 * z - d));
}

vec2 uvAt(vec2 px) {
  return (px + u_size * 0.5 + u_margin) / (u_size + 2.0 * u_margin);
}

vec4 field(vec2 px) {
  return texture2D(u_field, uvAt(px));
}

// The frost: the field softened over a small disc, as the CSS blur softens
// what the lens cannot see.
vec4 frosted(vec2 px, float r) {
  vec4 sum = field(px) * 0.2;
  for (int i = 0; i < 8; i++) {
    float a = float(i) * 0.785398;
    sum += field(px + vec2(cos(a), sin(a)) * r) * 0.1;
  }
  return sum;
}

vec4 over(vec4 top, vec4 under) {
  return top + under * (1.0 - top.a);
}

void main() {
  vec2 half_ = u_size * 0.5;
  float r = min(u_radius, min(half_.x, half_.y));
  float sdf = rrect(v_px, half_, r);
  float mask = 1.0 - smoothstep(-1.0, 0.5, sdf);
  if (mask <= 0.0) { gl_FragColor = vec4(0.0); return; }

  float inside = -sdf;
  float z = u_bevel;
  float e = 1.5;
  vec2 grad = vec2(
    bevel(-rrect(v_px + vec2(e, 0.0), half_, r), z) - bevel(-rrect(v_px - vec2(e, 0.0), half_, r), z),
    bevel(-rrect(v_px + vec2(0.0, e), half_, r), z) - bevel(-rrect(v_px - vec2(0.0, e), half_, r), z)
  ) / (2.0 * e);
  // y runs down the pane; the normal's y runs up, toward the light.
  vec3 n = normalize(vec3(-grad.x, grad.y, 1.0));
  float depth = smoothstep(0.0, z, inside);
  float rim = 1.0 - depth;

  // Both faces bend the light toward the thick middle, so the rim pulls in
  // the field from beyond the edge.
  float thick = bevel(inside, z) / z;
  vec2 bend = grad * (0.667 + 0.333 * thick) * u_refract * z * 1.6;
  vec2 at = v_px - bend;
  vec2 split = vec2(-n.x, n.y) * u_chroma * 3.0 * rim;

  float soft = u_frost * (0.6 + 0.4 * depth);
  vec4 g = frosted(at, soft);
  vec4 rr = frosted(at + split, soft);
  vec4 bb = frosted(at - split, soft);
  vec4 ink = vec4(rr.r, g.g, bb.b, max(g.a, max(rr.a, bb.a)));
  // The field's glyphs are faded toward the sheet; the lens draws them
  // further from it, so the bending reads.
  vec3 tone = ink.a > 0.0 ? ink.rgb / ink.a : u_sheet;
  tone = clamp(u_sheet + (tone - u_sheet) * u_gain, 0.0, 1.0);
  ink = vec4(tone * ink.a, ink.a);

  // Light falls from the top left.
  float lift = 0.5 - 0.5 * (v_px.y / half_.y);
  vec3 h1 = normalize(normalize(vec3(-0.4, 0.7, 1.0)) + vec3(0.0, 0.0, 1.0));
  vec3 h2 = normalize(normalize(vec3(0.0, 0.9, 0.4)) + vec3(0.0, 0.0, 1.0));
  float spec = (pow(max(dot(n, h1), 0.0), 80.0) + 0.6 * pow(max(dot(n, h2), 0.0), 120.0)) * rim;
  float fresnel = pow(1.0 - n.z, 3.0);
  float stroke = smoothstep(-2.5, -1.2, sdf) * (1.0 - smoothstep(-0.8, 0.2, sdf));
  float light = spec * u_spec
    + fresnel * u_rim * (0.25 + 0.75 * lift)
    + stroke * u_rim * (0.15 + 0.85 * lift);
  // The lower rim, turned from the light, holds a little shade.
  float shade = fresnel * u_shade * (1.0 - lift) * 2.0 + stroke * u_shade * (1.0 - lift);

  vec4 color = over(vec4(0.0, 0.0, 0.0, clamp(shade, 0.0, 1.0)), ink);
  color = over(vec4(u_light, 1.0) * clamp(light, 0.0, 1.0), color);
  gl_FragColor = color * mask;
}`

const probe =
  typeof document === 'undefined' ? undefined : document.createElement('canvas')

/** A CSS colour as sRGB in 0 to 1, through a 1px canvas. */
function rgb(css: string): [number, number, number] {
  const context = probe?.getContext('2d', { willReadFrequently: true })
  if (!context || !css) return [0.5, 0.5, 0.5]
  context.clearRect(0, 0, 1, 1)
  context.fillStyle = css
  context.fillRect(0, 0, 1, 1)
  const [r = 0, g = 0, b = 0] = context.getImageData(0, 0, 1, 1).data
  return [r / 255, g / 255, b / 255]
}

interface Tuning {
  /** The sheet the field's glyphs fade toward, at its middle, as the field reads it. */
  sheet: [number, number, number]
  refract: number
  bevel: number
  chroma: number
  gain: number
  frost: number
  spec: number
  rim: number
  shade: number
  radius: number
}

function readTuning(element: Element): Tuning {
  const style = getComputedStyle(element)
  const number = (name: string, fallback: number) => {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Number.isFinite(value) ? value : fallback
  }
  const from = rgb(style.getPropertyValue('--sheet-from').trim())
  const to = rgb(style.getPropertyValue('--sheet-to').trim())
  return {
    sheet: [
      (from[0] + to[0]) / 2,
      (from[1] + to[1]) / 2,
      (from[2] + to[2]) / 2,
    ],
    refract: number('--liquid-refract', 1),
    bevel: number('--liquid-bevel', 16),
    chroma: number('--liquid-chroma', 0.5),
    gain: number('--liquid-gain', 2),
    frost: number('--liquid-frost', 2.5),
    spec: number('--liquid-specular', 0.5),
    rim: number('--liquid-rim', 0.5),
    shade: number('--liquid-shade', 0.1),
    radius: Number.parseFloat(style.borderTopLeftRadius) || 20,
  }
}

function compile(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)
  if (!shader) return undefined
  gl.shaderSource(shader, source)
  gl.compileShader(shader)
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('liquid lens:', gl.getShaderInfoLog(shader))
    return undefined
  }
  return shader
}

/** The Life field canvas under a point, if the field is showing there. */
function fieldUnder(x: number, y: number): HTMLCanvasElement | undefined {
  for (const canvas of document.querySelectorAll<HTMLCanvasElement>(
    'canvas[data-life-field]',
  )) {
    const rect = canvas.getBoundingClientRect()
    if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)
      return canvas
  }
  return undefined
}

/**
 * The liquid glass composer's lens: a canvas over the pane's frost, under
 * its content, that draws the Life field behind the pane bent at the rim and
 * lights the bevel. Without WebGL it draws nothing and the frost stands alone.
 */
export const LiquidLens: FC = () => {
  const ref = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const host = ref.current
    const pane = host?.parentElement
    if (!host || !pane) return
    // A canvas of its own per mount: losing the context on cleanup would
    // leave a reused canvas without one.
    const canvas = document.createElement('canvas')
    canvas.className = 'block size-full rounded-[inherit]'
    host.append(canvas)
    const gl = canvas.getContext('webgl', {
      premultipliedAlpha: true,
      antialias: false,
      alpha: true,
    })
    if (!gl) return () => canvas.remove()
    const vertex = compile(gl, gl.VERTEX_SHADER, VERTEX)
    const fragment = compile(gl, gl.FRAGMENT_SHADER, FRAGMENT)
    const program = gl.createProgram()
    if (!vertex || !fragment) return () => canvas.remove()
    gl.attachShader(program, vertex)
    gl.attachShader(program, fragment)
    gl.linkProgram(program)
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      return () => canvas.remove()
    gl.useProgram(program)

    const quad = gl.createBuffer()
    gl.bindBuffer(gl.ARRAY_BUFFER, quad)
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([0, 0, 1, 0, 0, 1, 0, 1, 1, 0, 1, 1]),
      gl.STATIC_DRAW,
    )
    const uv = gl.getAttribLocation(program, 'a_uv')
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 0, 0)

    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)

    const at = (name: string) => gl.getUniformLocation(program, name)
    const uniforms = {
      size: at('u_size'),
      radius: at('u_radius'),
      margin: at('u_margin'),
      refract: at('u_refract'),
      bevel: at('u_bevel'),
      chroma: at('u_chroma'),
      gain: at('u_gain'),
      frost: at('u_frost'),
      spec: at('u_spec'),
      rim: at('u_rim'),
      shade: at('u_shade'),
      light: at('u_light'),
      sheet: at('u_sheet'),
    }
    gl.uniform3f(uniforms.light, 1, 1, 1)
    gl.uniform1f(uniforms.margin, MARGIN)

    // The field around the pane, cropped so only that much goes to the GPU.
    const crop = document.createElement('canvas')
    const cropContext = crop.getContext('2d')

    let tuning = readTuning(pane)
    const retune = new MutationObserver(() => {
      tuning = readTuning(pane)
    })
    retune.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style', 'data-theme'],
    })

    let frame = 0
    const draw = () => {
      frame = requestAnimationFrame(draw)
      const rect = canvas.getBoundingClientRect()
      if (rect.width < 1 || rect.height < 1) return
      const density = window.devicePixelRatio || 1
      const width = Math.round(rect.width * density)
      const height = Math.round(rect.height * density)
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width
        canvas.height = height
      }
      const cropWidth = Math.round((rect.width + 2 * MARGIN) * density)
      const cropHeight = Math.round((rect.height + 2 * MARGIN) * density)
      if (crop.width !== cropWidth || crop.height !== cropHeight) {
        crop.width = cropWidth
        crop.height = cropHeight
      }
      if (cropContext) {
        cropContext.clearRect(0, 0, cropWidth, cropHeight)
        const source = fieldUnder(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        )
        if (source) {
          const box = source.getBoundingClientRect()
          const scaleX = source.width / box.width
          const scaleY = source.height / box.height
          cropContext.drawImage(
            source,
            (rect.left - MARGIN - box.left) * scaleX,
            (rect.top - MARGIN - box.top) * scaleY,
            (rect.width + 2 * MARGIN) * scaleX,
            (rect.height + 2 * MARGIN) * scaleY,
            0,
            0,
            cropWidth,
            cropHeight,
          )
        }
      }
      gl.viewport(0, 0, width, height)
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, crop)
      gl.uniform2f(uniforms.size, rect.width, rect.height)
      gl.uniform1f(uniforms.radius, tuning.radius)
      gl.uniform1f(uniforms.refract, tuning.refract)
      gl.uniform1f(uniforms.bevel, tuning.bevel)
      gl.uniform1f(uniforms.chroma, tuning.chroma)
      gl.uniform1f(uniforms.gain, tuning.gain)
      gl.uniform1f(uniforms.frost, tuning.frost)
      gl.uniform1f(uniforms.spec, tuning.spec)
      gl.uniform1f(uniforms.rim, tuning.rim)
      gl.uniform1f(uniforms.shade, tuning.shade)
      gl.uniform3f(uniforms.sheet, ...tuning.sheet)
      gl.clearColor(0, 0, 0, 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.drawArrays(gl.TRIANGLES, 0, 6)
    }
    frame = requestAnimationFrame(draw)

    return () => {
      cancelAnimationFrame(frame)
      retune.disconnect()
      gl.getExtension('WEBGL_lose_context')?.loseContext()
      canvas.remove()
    }
  }, [])

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className="pointer-events-none absolute -inset-px -z-10 rounded-[inherit]"
    />
  )
}
