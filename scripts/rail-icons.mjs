// SOURCING: pngjs (PNG decode and encode, already a dev dependency for the story oracle); the colour split is Theorem's own, since no library recolours a flat-colour icon by region
// Splits each rail icon into four alpha masks: the outline, an accent fill, a tint
// fill and a paper fill. The rail paints each mask with a palette token
// (src/components/shell/rail-marks.tsx), so one set of bytes takes every
// palette and both modes. Run `node scripts/rail-icons.mjs`; rail-icons.test.ts
// fails while the committed layers and this script disagree.
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { PNG } from 'pngjs'

export const LAYERS = ['line', 'accent', 'tint', 'paper']

/**
 * The icons, by name. `source` is relative to src/assets/icons/streamline.
 * An icon drawn as line art alone (the Light style) has no fills of its own,
 * so `autofill` colours the regions its outline encloses: every enclosed region
 * is a tint, and when there are several the topmost is the accent.
 */
export const ICONS = [
  { name: 'home', source: 'rail/source/streamline-house-1.png' },
  { name: 'index', source: 'rail/source/streamline-drawer-file.png' },
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

const ROOT = new URL('../src/assets/icons/streamline/', import.meta.url)
export const LAYERS_DIR = new URL('rail/layers/', ROOT)

/** Every file the icons make, by name: the layer PNGs and the module that imports them. */
export async function railFiles() {
  const files = new Map()
  const used = new Map()
  for (const icon of ICONS) {
    const source = await readFile(new URL(icon.source, ROOT))
    const layers = layersOf(source, icon.autofill ?? false)
    for (const [layer, png] of Object.entries(layers)) {
      files.set(`${icon.name}-${layer}.png`, PNG.sync.write(png))
      used.set(icon.name, [...(used.get(icon.name) ?? []), layer])
    }
  }
  const imports = [...used].flatMap(([name, layers]) =>
    layers.map(
      (layer) =>
        `import ${name}${layer[0].toUpperCase()}${layer.slice(1)} from './${name}-${layer}.png'`,
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

/** Each rail icon's masks: the PNG's alpha is the layer. */
export const RAIL_LAYERS = {
${table.join('\n')}
} as const

export type RailIcon = keyof typeof RAIL_LAYERS
`,
  )
  return files
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  // Read and decode every input first, so a missing or damaged PNG fails
  // before any committed output is removed.
  const files = await railFiles()
  await mkdir(LAYERS_DIR, { recursive: true })
  for (const stale of await readdir(LAYERS_DIR)) {
    await rm(new URL(stale, LAYERS_DIR))
  }
  for (const [file, bytes] of files) {
    await writeFile(new URL(file, LAYERS_DIR), bytes)
  }
  console.log(`wrote ${(await readdir(LAYERS_DIR)).length} files`)
}
