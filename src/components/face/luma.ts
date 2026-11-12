// SOURCING: luma.gl 9.3 (@luma.gl/core createDevice and Buffer, @luma.gl/engine Model and ShaderInputs, @luma.gl/webgl webgl2Adapter): one instanced triangle strip, a quad per grain, as the study's renderer drew its cells (theorem-face-study src/renderer.js, written against 9.4; this is the 9.3.6 that @cosmos.gl/graph already brings). The grain's look, light that adds so piled grains burn toward white inside a soft halo, is this app's reading of the reference robot's glowing eyes. Which grains are ink is decided a fragment at a time by the signed distance to the plate's rounded box (Inigo Quilez, "2D distance functions"; ./plate has the same in TypeScript).
import { Buffer, luma } from '@luma.gl/core'
import type { Device } from '@luma.gl/core'
import { Model, ShaderInputs } from '@luma.gl/engine'
import { webgl2Adapter } from '@luma.gl/webgl'
import { GRAIN_STRIDE } from '@/lib/face/particles'
import { INK } from './painter'
import type { Painter } from './painter'

/** How far past its radius a grain's quad reaches, for the halo. */
const REACH = 2.6

// luma checks the block against uniformTypes one field to a line.
const VIEW_BLOCK = `layout(std140) uniform viewUniforms {
  vec4 plate;
  vec2 extent;
  float corner;
  float ink;
  float inked;
} view;`

const viewModule = {
  name: 'view',
  vs: VIEW_BLOCK,
  fs: VIEW_BLOCK,
  uniformTypes: {
    plate: 'vec4<f32>',
    extent: 'vec2<f32>',
    corner: 'f32',
    ink: 'f32',
    inked: 'f32',
  },
  defaultUniforms: {
    plate: [0, 0, -1e4, -1e4],
    extent: [1, 1],
    corner: 0,
    ink: 0,
    inked: 0,
  },
} as const

const vs = `#version 300 es
precision highp float;
in vec4 seat;
in vec4 tint;
out vec2 uv;
out vec2 spot;
out vec4 colour;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float(gl_VertexID >> 1)) * 2.0 - 1.0;
  vec2 at = seat.xy + corner * seat.z * ${REACH.toFixed(1)};
  gl_Position = vec4(at.x / view.extent.x, -at.y / view.extent.y, 0.0, 1.0);
  uv = corner * ${REACH.toFixed(1)};
  spot = at;
  colour = tint;
}`

const fs = `#version 300 es
precision highp float;
in vec2 uv;
in vec2 spot;
in vec4 colour;
out vec4 fragColor;
// How far outside the plate a point is: a rounded box, which is a ball when its half sizes are its corner.
float offPlate(vec2 point) {
  vec2 q = abs(point - view.plate.xy) - (view.plate.zw - view.corner);
  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - view.corner;
}
void main() {
  float d = length(uv);
  float core = 1.0 - smoothstep(0.55, 1.15, d);
  float halo = pow(max(0.0, 1.0 - d / ${REACH.toFixed(1)}), 2.6) * 0.16;
  // Light adds: where grains pile up the colour burns toward white, and thins to a glow at the edge.
  vec4 light = colour * (core * 0.42 + halo);
  // Ink covers: the grain's own hue with the light taken out, piling up to solid, with less of a smudge round it.
  float cover = colour.a * (core * 0.5 + halo * 0.4);
  vec4 dark = vec4(colour.rgb / max(colour.a, 0.0001) * ${INK.toFixed(2)} * cover, cover);
  // Matter is ink only where it is off the plate; with no plate, that is everywhere. The edge is a pixel wide.
  float out_ = offPlate(spot);
  float inky = view.ink * clamp(out_ / max(fwidth(out_), 0.0001) + 0.5, 0.0, 1.0);
  // Light and ink are blended differently, so each is a draw of its own.
  fragColor = view.inked > 0.5 ? dark * inky : light * (1.0 - inky);
}`

/** Light adds to what is under it. */
const ADDS = {
  blend: true,
  blendColorOperation: 'add',
  blendColorSrcFactor: 'one',
  blendColorDstFactor: 'one',
  blendAlphaOperation: 'add',
  blendAlphaSrcFactor: 'one',
  blendAlphaDstFactor: 'one',
  depthWriteEnabled: false,
  depthCompare: 'always',
  cullMode: 'none',
} as const

/** Ink covers what is under it (premultiplied colour over). */
const COVERS = {
  ...ADDS,
  blendColorDstFactor: 'one-minus-src-alpha',
  blendAlphaDstFactor: 'one-minus-src-alpha',
} as const

/** Draws grains with luma.gl on WebGL2. Rejects when the browser has none. */
export async function lumaPainter(canvas: HTMLCanvasElement): Promise<Painter> {
  const device: Device = await luma.createDevice({
    type: 'webgl',
    adapters: [webgl2Adapter],
    createCanvasContext: {
      canvas,
      useDevicePixels: true,
      autoResize: true,
      alphaMode: 'premultiplied',
    },
  })
  try {
    const inputs = new ShaderInputs({ view: viewModule })
    const model = new Model(device, {
      id: 'theo-face',
      vs,
      fs,
      modules: [viewModule],
      shaderInputs: inputs,
      bufferLayout: [
        {
          name: 'grains',
          stepMode: 'instance',
          byteStride: GRAIN_STRIDE * 4,
          attributes: [
            { attribute: 'seat', format: 'float32x4', byteOffset: 0 },
            { attribute: 'tint', format: 'float32x4', byteOffset: 16 },
          ],
        },
      ],
      topology: 'triangle-strip',
      vertexCount: 4,
      instanceCount: 0,
      isInstanced: true,
      parameters: ADDS,
    })
    // luma reports a shader that failed to build on the pipeline and keeps going; a face that cannot be drawn must fall back.
    if (model.pipeline.linkStatus === 'error')
      throw new Error('The face’s shaders did not build.')
    let buffer: Buffer | undefined
    return {
      kind: 'luma',
      draw(grains, count, width, height, look = {}) {
        const { ink = false, plate } = look
        const bytes = count * GRAIN_STRIDE * 4
        if (!buffer || buffer.byteLength < bytes) {
          buffer?.destroy()
          buffer = device.createBuffer({
            byteLength: bytes,
            usage: Buffer.VERTEX | Buffer.COPY_DST,
          })
          model.setAttributes({ grains: buffer })
        }
        buffer.write(grains.subarray(0, count * GRAIN_STRIDE))
        model.setInstanceCount(count)
        const pass = device.beginRenderPass({
          framebuffer: device.getDefaultCanvasContext().getCurrentFramebuffer(),
          clearColor: [0, 0, 0, 0],
        })
        // All light, all ink, or (ink off a plate) the ink and then the light on the plate.
        const draws = !ink ? [false] : plate ? [true, false] : [true]
        for (const inked of draws) {
          model.setParameters(inked ? COVERS : ADDS)
          inputs.setProps({
            view: {
              plate: plate
                ? [plate.x, plate.y, plate.hw, plate.hh]
                : [0, 0, -1e4, -1e4],
              extent: [width / 2, height / 2],
              corner: plate?.corner ?? 0,
              ink: ink ? 1 : 0,
              inked: inked ? 1 : 0,
            },
          })
          model.draw(pass)
        }
        pass.end()
        device.submit()
      },
      destroy() {
        buffer?.destroy()
        model.destroy()
        device.destroy()
      },
    }
  } catch (error) {
    device.destroy()
    throw error
  }
}
