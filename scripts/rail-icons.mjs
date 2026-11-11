// SOURCING: pngjs (PNG decode and encode, already a dev dependency for the story oracle); potrace (outline tracing), jimp (the bicubic enlargement potrace needs to see an edge's sub-pixel position) and svgo (path data shortening) for the vector layers; the colour split is Theorem's own, since no library recolours a flat-colour icon by region
// Splits each colour icon into four masks: the outline, an accent fill, a tint
// fill and a paper fill. The rail (src/components/shell/rail-marks.tsx) and the
// controls' colour marks (src/components/icons.tsx) paint each mask with a palette
// token, so one set of bytes takes every palette and both modes. The rail's masks
// are PNG alpha; the controls' are traced to SVG outlines. Run
// `node scripts/rail-icons.mjs`; rail-icons.test.ts fails while the committed
// layers and this script disagree.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import Jimp from 'jimp'
import { PNG } from 'pngjs'
import potrace from 'potrace'
import { optimize } from 'svgo'

export const LAYERS = ['line', 'accent', 'tint', 'paper']

/**
 * The rail's icons, by name. `source` is relative to src/assets/icons/streamline.
 * An icon drawn as line art alone (the Light style) has no fills of its own,
 * so `autofill` colours the regions its outline encloses: every enclosed region
 * is a tint, and when there are several the topmost is the accent.
 */
export const ICONS = [
  { name: 'home', source: 'rail/source/streamline-house-1.png' },
  { name: 'index', source: 'rail/source/streamline-drawer-file.png' },
  {
    name: 'notes',
    source: 'streamline-common-file-stack.png',
    autofill: true,
  },
  {
    name: 'pages',
    source: 'streamline-browser-page-layout.png',
    autofill: true,
  },
  { name: 'spaces', source: 'rail/source/streamline-dzone-logo.png' },
  { name: 'canvas', source: 'rail/source/streamline-design-file-vector.png' },
  { name: 'ide', source: 'rail/source/streamline-file-code.png' },
  { name: 'vault', source: 'rail/source/streamline-folder-zip.png' },
  { name: 'files', source: 'rail/source/streamline-hierarchy-files-1.png' },
]

/** The controls' colour marks: the composer, a thread's row, a tool call, the search. */
export const CONTROLS = [
  {
    name: 'thread',
    source: 'control/source/streamline-messages-bubble-text-1.png',
  },
  {
    name: 'chatSearch',
    source: 'control/source/streamline-messages-bubble-search.png',
  },
  { name: 'send', source: 'control/source/streamline-send-email-1.png' },
  {
    name: 'upload',
    source: 'control/source/streamline-common-file-upload.png',
  },
  {
    name: 'attachFolder',
    source: 'control/source/streamline-folder-image-1.png',
  },
  { name: 'plan', source: 'control/source/streamline-task-list-quill.png' },
  { name: 'webSearch', source: 'control/source/streamline-network-search.png' },
  { name: 'newChat', source: 'control/source/streamline-pencil-write.png' },
  { name: 'toolRunning', source: 'control/source/streamline-list-edit.png' },
  {
    name: 'toolDone',
    source: 'control/source/streamline-task-list-multiple.png',
  },
]

/**
 * Each set of icons, the folder its layers are written to, and what its module
 * exports. A `vector` set is traced to SVG outlines; the others keep PNG alpha.
 */
export const SETS = [
  {
    dir: 'rail/layers/',
    icons: ICONS,
    table: 'RAIL_LAYERS',
    type: 'RailIcon',
    what: 'rail icon',
  },
  {
    dir: 'control/layers/',
    icons: CONTROLS,
    table: 'CONTROL_LAYERS',
    type: 'ControlIcon',
    what: 'control mark',
    vector: true,
  },
]

const clamp = (n) => Math.min(1, Math.max(0, n))
const smooth = (lo, hi, x) => {
  const t = clamp((x - lo) / (hi - lo))
  return t * t * (3 - 2 * t)
}

/** A pixel's share of each layer; the four sum to its alpha. */
export function split([r, g, b, a]) {
  const alpha = a / 255
  const luma = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
  const chroma = (Math.max(r, g, b) - Math.min(r, g, b)) / 255
  // Dark pixels are the outline; the edge between outline and fill is a blend.
  const line = alpha * clamp((0.72 - luma) / 0.6)
  const fill = alpha - line
  const paper = smooth(0.9, 0.95, luma) * (chroma > 0.5 ? 0 : 1)
  const accent = chroma > 0.5 ? 1 : 1 - smooth(0.78, 0.84, luma)
  const tint = Math.max(0, 1 - paper - accent)
  return {
    line,
    accent: fill * Math.min(accent, 1 - paper),
    tint: fill * tint,
    paper: fill * paper,
  }
}

/** Regions of transparent pixels the outline closes off from the border. */
function enclosed(png) {
  const { width: w, height: h, data } = png
  const open = (i) => data[i * 4 + 3] < 128
  const outside = new Uint8Array(w * h)
  const stack = []
  const push = (i) => {
    if (open(i) && !outside[i]) {
      outside[i] = 1
      stack.push(i)
    }
  }
  for (let x = 0; x < w; x++) (push(x), push((h - 1) * w + x))
  for (let y = 0; y < h; y++) (push(y * w), push(y * w + w - 1))
  while (stack.length) {
    const i = stack.pop()
    const x = i % w
    const y = (i - x) / w
    if (x > 0) push(i - 1)
    if (x < w - 1) push(i + 1)
    if (y > 0) push(i - w)
    if (y < h - 1) push(i + w)
  }
  const region = new Int32Array(w * h).fill(-1)
  const tops = []
  for (let start = 0; start < w * h; start++) {
    if (!open(start) || outside[start] || region[start] >= 0) continue
    const id = tops.length
    tops.push(Math.floor(start / w))
    region[start] = id
    stack.push(start)
    while (stack.length) {
      const i = stack.pop()
      const x = i % w
      const near = [x > 0 ? i - 1 : -1, x < w - 1 ? i + 1 : -1, i - w, i + w]
      for (const n of near) {
        if (n >= 0 && n < w * h && open(n) && !outside[n] && region[n] < 0) {
          region[n] = id
          stack.push(n)
        }
      }
    }
  }
  // A lone region is the icon's body, so only a second one earns the accent.
  return {
    region,
    topmost: tops.length > 1 ? tops.indexOf(Math.min(...tops)) : -1,
  }
}

/** A layer that paints less than this many whole pixels is anti-aliasing noise, so it is dropped. */
const MIN_INK = 6
const inkOf = ({ data }) => {
  let sum = 0
  for (let i = 3; i < data.length; i += 4) sum += data[i] / 255
  return sum
}

/** The four masks of one icon, each as a PNG with the layer in its alpha. */
export function layersOf(source, autofill) {
  const png = PNG.sync.read(source)
  const { width: w, height: h, data } = png
  const fills = autofill ? enclosed(png) : undefined
  const out = Object.fromEntries(
    LAYERS.map((layer) => [layer, new PNG({ width: w, height: h })]),
  )
  for (let i = 0; i < w * h; i++) {
    const px = [...data.subarray(i * 4, i * 4 + 4)]
    const share = split(px)
    if (fills && fills.region[i] >= 0) {
      // A pixel the outline encloses was transparent; fill it.
      const accent = fills.region[i] === fills.topmost
      share.accent = accent ? 1 : 0
      share.tint = accent ? 0 : 1
    }
    for (const layer of LAYERS) {
      out[layer].data[i * 4 + 3] = Math.round(share[layer] * 255)
    }
  }
  return Object.fromEntries(
    LAYERS.map((layer) => [layer, out[layer]]).filter(
      ([, png]) => inkOf(png) >= MIN_INK,
    ),
  )
}

/** The layer a flat colour paints. */
function layerOf(rgb) {
  const share = split([...rgb, 255])
  if (share.line > 0.5) return 'line'
  return ['accent', 'tint', 'paper'].reduce((a, b) =>
    share[b] > share[a] ? b : a,
  )
}

/**
 * The icon's own flat colours: an opaque colour that three of a pixel's eight
 * neighbours share. An edge's blend repeats along the edge, so at most two do.
 */
function flats({ width: w, height: h, data }) {
  const key = (x, y) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return -1
    const i = (y * w + x) * 4
    return data[i + 3] === 255
      ? (data[i] << 16) | (data[i + 1] << 8) | data[i + 2]
      : -1
  }
  const found = new Set()
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const k = key(x, y)
      if (k < 0 || found.has(k)) continue
      let same = 0
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if ((dx || dy) && key(x + dx, y + dy) === k) same++
        }
      }
      if (same >= 3) found.add(k)
    }
  }
  return [...found].map((k) => {
    const rgb = [k >> 16, (k >> 8) & 255, k & 255]
    return { rgb, layer: layerOf(rgb) }
  })
}

/** How far, in 8-bit RGB, a colour may sit from a blend of two flats and still be that blend. */
const STRAY = 30

/** The blend of two of `candidates` nearest a pixel's colour: which two, how far along, how far off. */
function blend(pixel, palette, candidates) {
  let best = { distance: Infinity }
  for (const a of candidates) {
    for (const b of candidates) {
      if (b < a) continue
      const from = palette[a].rgb
      const step = palette[b].rgb.map((v, k) => v - from[k])
      const length = step.reduce((sum, v) => sum + v * v, 0)
      const along = step.reduce(
        (sum, v, k) => sum + v * (pixel[k] - from[k]),
        0,
      )
      const t = length ? clamp(along / length) : 0
      const distance = step.reduce(
        (sum, v, k) => sum + (from[k] + v * t - pixel[k]) ** 2,
        0,
      )
      if (distance < best.distance) best = { distance, a, b, t }
    }
  }
  return best
}

/**
 * Each layer's coverage of each pixel, 0 to 1. A pixel of a flat colour is that
 * colour's layer; any other is an edge, a blend of two of the flats within two
 * pixels of it, and is shared between their layers. Splitting an edge by its own
 * colour instead would give the grey between outline and paper to the tint.
 */
function unmix(png) {
  const { width: w, height: h, data } = png
  const palette = flats(png)
  const masks = Object.fromEntries(
    LAYERS.map((layer) => [layer, new Float32Array(w * h)]),
  )
  const flat = Int16Array.from({ length: w * h }, (_, i) =>
    data[i * 4 + 3]
      ? palette.findIndex(({ rgb }) =>
          rgb.every((v, k) => v === data[i * 4 + k]),
        )
      : -1,
  )
  for (let i = 0; i < w * h; i++) {
    const alpha = data[i * 4 + 3] / 255
    if (!alpha) continue
    if (flat[i] >= 0) {
      masks[palette[flat[i]].layer][i] = alpha
      continue
    }
    const x = i % w
    const y = (i - x) / w
    const near = new Set()
    for (let ny = Math.max(0, y - 2); ny <= Math.min(h - 1, y + 2); ny++) {
      for (let nx = Math.max(0, x - 2); nx <= Math.min(w - 1, x + 2); nx++) {
        if (flat[ny * w + nx] >= 0) near.add(flat[ny * w + nx])
      }
    }
    // The flats beside it first; where they do not make its colour (lines that
    // meet leave no flat between them), any two of the icon's flats.
    const pixel = data.subarray(i * 4, i * 4 + 3)
    let best = blend(pixel, palette, [...near])
    if (best.distance > STRAY ** 2) {
      best = blend(pixel, palette, [...palette.keys()])
    }
    if (best.distance > STRAY ** 2) {
      // No two flats make this colour: a stripe too thin to hold a flat of its
      // own. Its own colour says what it is.
      const share = split(data.subarray(i * 4, i * 4 + 4))
      for (const layer of LAYERS) masks[layer][i] = share[layer]
      continue
    }
    masks[palette[best.a].layer][i] += alpha * (1 - best.t)
    masks[palette[best.b].layer][i] += alpha * best.t
  }
  return masks
}

/** How many times its size a mask is enlarged before tracing, so an edge keeps its sub-pixel place. */
const ENLARGE = 8

/** The outline of one mask as SVG path data, or nothing when the mask is empty. */
async function outline(mask, w, h, threshold) {
  const image = new Jimp(w, h, 0xffffffff)
  for (let i = 0; i < w * h; i++) {
    const v = 255 - Math.round(mask[i] * 255)
    image.bitmap.data.set([v, v, v, 255], i * 4)
  }
  image.resize(w * ENLARGE, h * ENLARGE, Jimp.RESIZE_BICUBIC)
  const png = await image.getBufferAsync(Jimp.MIME_PNG)
  const tracer = new potrace.Potrace({
    threshold,
    turdSize: ENLARGE * ENLARGE,
    optTolerance: 0.4,
  })
  await new Promise((resolve, reject) =>
    tracer.loadImage(png, (error) => (error ? reject(error) : resolve())),
  )
  return tracer.getPathTag('#000')
}

/**
 * The masks of one icon as SVGs, the layer being the shape. A fill counts a
 * little under half coverage as covered, so it reaches under the outline drawn
 * over it and no ground shows between the two.
 */
async function vectorLayersOf(source) {
  const png = PNG.sync.read(source)
  const { width: w, height: h } = png
  const masks = unmix(png)
  const out = {}
  for (const layer of LAYERS) {
    if (masks[layer].reduce((sum, v) => sum + v, 0) < MIN_INK) continue
    const path = await outline(masks[layer], w, h, layer === 'line' ? 128 : 150)
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w * ENLARGE} ${h * ENLARGE}">${path}</svg>`
    out[layer] = `${
      optimize(svg, {
        plugins: [{ name: 'convertPathData', params: { floatPrecision: 1 } }],
      }).data
    }\n`
  }
  return out
}

const ROOT = new URL('../src/assets/icons/streamline/', import.meta.url)
export const layersDir = (set) => new URL(set.dir, ROOT)

/** Every file a set makes, by name: the layer images and the module that imports them. */
export async function layerFiles(set) {
  const files = new Map()
  const used = new Map()
  const ext = set.vector ? 'svg' : 'png'
  for (const icon of set.icons) {
    const source = await readFile(new URL(icon.source, ROOT))
    const layers = set.vector
      ? await vectorLayersOf(source)
      : Object.fromEntries(
          Object.entries(layersOf(source, icon.autofill ?? false)).map(
            ([layer, png]) => [layer, PNG.sync.write(png)],
          ),
        )
    for (const [layer, bytes] of Object.entries(layers)) {
      files.set(`${icon.name}-${layer}.${ext}`, bytes)
      used.set(icon.name, [...(used.get(icon.name) ?? []), layer])
    }
  }
  const imports = [...used].flatMap(([name, layers]) =>
    layers.map(
      (layer) =>
        `import ${name}${layer[0].toUpperCase()}${layer.slice(1)} from './${name}-${layer}.${ext}'`,
    ),
  )
  const table = [...used].map(
    ([name, layers]) =>
      `  ${name}: { ${layers.map((layer) => `${layer}: ${name}${layer[0].toUpperCase()}${layer.slice(1)}`).join(', ')} },`,
  )
  files.set(
    'index.ts',
    `// Generated by scripts/rail-icons.mjs. Do not edit; run \`bun scripts/rail-icons.mjs\`.
${imports.join('\n')}

/** Each ${set.what}'s masks: ${set.vector ? "the SVG's shape" : "the PNG's alpha"} is the layer. */
export const ${set.table} = {
${table.join('\n')}
} as const

export type ${set.type} = keyof typeof ${set.table}
`,
  )
  return files
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Read and decode every input first, so a missing or damaged PNG fails
  // before any committed output is removed.
  const made = await Promise.all(
    SETS.map(async (set) => [layersDir(set), await layerFiles(set)]),
  )
  for (const [dir, files] of made) {
    await mkdir(dir, { recursive: true })
    for (const stale of await readdir(dir)) await rm(new URL(stale, dir))
    for (const [file, bytes] of files) {
      await writeFile(new URL(file, dir), bytes)
    }
    console.log(`wrote ${files.size} files to ${dir.pathname}`)
  }
}
