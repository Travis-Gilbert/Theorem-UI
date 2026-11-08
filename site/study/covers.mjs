// Typesets the three books' jackets from each edition's colours and sets the type on their spines.
// These are not the published cover art: evidence/LEDGER.md has the references. Run with node from site/:
//   CHROME_SHELL=$(find film/node_modules/.remotion -type f -name chrome-headless-shell) node study/covers.mjs
// A jacket unwraps back cover, spine, front cover, left to right with the head at the top, as the GLB's UVs do (layout.json).
import { mkdirSync, readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const { covers } = JSON.parse(readFileSync('src/study/layout.json', 'utf8'))
const PX_PER_M = 6000
const mm = (n) => n * (PX_PER_M / 1000)

/** A seeded lattice walk: in the spirit of the Hamming's cover, not a copy of its drawing. */
function walk(seed, steps) {
  let s = seed
  const next = () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
  let x = 0
  let y = 0
  const points = [[x, y]]
  for (let i = 0; i < steps; i++) {
    const roll = next()
    if (roll < 0.28) y += 1
    else if (roll < 0.5) x += 1
    else if (roll < 0.72) x -= 1
    else if (roll < 0.86) y -= 1
    else y += 1
    x = Math.max(-9, Math.min(9, x))
    points.push([x, y])
  }
  return points
}

const halftone = (w, h) => {
  // A dot screen in a pastel foil's colours, in place of the published halftone portrait.
  const dots = []
  const pitch = mm(2.6)
  for (let j = 0; j * pitch < h; j++)
    for (let i = 0; i * pitch < w; i++) {
      const x = (i + (j % 2 ? 0.5 : 0)) * pitch
      const y = j * pitch
      const dx = (x - w * 0.52) / (w * 0.42)
      const dy = (y - h * 0.44) / (h * 0.36)
      const fall = Math.max(0, 1 - Math.hypot(dx, dy))
      const r = pitch * 0.5 * Math.min(1, fall * 1.5)
      if (r < 0.6) continue
      dots.push(`<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}"/>`)
    }
  return `<svg width="${w}" height="${h}" style="position:absolute;inset:0">
    <defs><linearGradient id="foil" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#f5c9dc"/><stop offset=".34" stop-color="#c7dcf6"/><stop offset=".67" stop-color="#cdf2d8"/><stop offset="1" stop-color="#f7e7b5"/>
    </linearGradient></defs>
    <g fill="url(#foil)">${dots.join('')}</g></svg>`
}

const hammingWalk = (w, h) => {
  const points = walk(19500815, 150)
  const unit = mm(3)
  const lowest = Math.min(...points.map(([, y]) => y))
  const highest = Math.max(...points.map(([, y]) => y))
  const scale = (h * 0.62) / ((highest - lowest) * unit)
  const path = points
    .map(([x, y], i) => `${i ? 'L' : 'M'}${(w * 0.5 + x * unit).toFixed(1)} ${(h * 0.82 - (y - lowest) * unit * scale).toFixed(1)}`)
    .join('')
  const [x0, y0] = points[0]
  return `<svg width="${w}" height="${h}" style="position:absolute;inset:0">
    <path d="${path}" fill="none" stroke="#F9C350" stroke-width="${mm(0.45)}"/>
    <circle cx="${w * 0.5 + x0 * unit}" cy="${h * 0.82 - (y0 - lowest) * unit * scale}" r="${mm(1.1)}" fill="#F9C350"/></svg>`
}

const dotRing = (cx, cy, r) => {
  const colours = ['#e8423f', '#f28c28', '#f6c343', '#3fae5a', '#2f8fd8', '#7a55c7']
  return Array.from({ length: 18 }, (_, i) => {
    const a = (i / 18) * Math.PI * 2
    return `<circle cx="${cx + Math.cos(a) * r}" cy="${cy + Math.sin(a) * r}" r="${mm(2)}" fill="${colours[i % 6]}"/>`
  }).join('')
}

const SPINE = 'position:absolute;top:0;bottom:0;writing-mode:vertical-rl;display:flex;align-items:center;white-space:nowrap;'

const JACKETS = {
  dream: {
    ground: '#2a2b2f',
    linen: true,
    front: (w, h) => `${halftone(w, h)}
      <div style="position:absolute;left:${mm(9)}px;bottom:${mm(9)}px;font:500 ${mm(4.6)}px/1.15 'Helvetica Neue';color:#e9ebef">The Dream<br>Machine</div>
      <div style="position:absolute;right:${mm(9)}px;bottom:${mm(9)}px;font:500 ${mm(4.6)}px/1.15 'Helvetica Neue';color:#e9ebef;text-align:right">M. Mitchell<br>Waldrop</div>`,
    spine: (size) => `<div style="${SPINE}justify-content:space-between;padding:${mm(14)}px 0;left:0;right:0;width:100%;
        background:linear-gradient(180deg,#f7cfe0,#cfe0f8 40%,#d4f4de 70%,#f8ebbd);-webkit-background-clip:text;background-clip:text;color:transparent">
        <span style="font:600 ${size * 0.36}px 'Helvetica Neue';letter-spacing:-.005em">The Dream Machine</span>
        <span style="font:500 ${size * 0.17}px 'Helvetica Neue'">Waldrop</span></div>`,
  },
  hamming: {
    ground: '#424434',
    front: (w, h) => `${hammingWalk(w, h)}
      <div style="position:absolute;right:0;top:0;width:${mm(19)}px;height:${mm(19)}px;background:#F9C350"></div>
      <div style="position:absolute;left:${mm(22)}px;top:${mm(19)}px;font:400 ${mm(5.6)}px/1.2 'Hoefler Text';color:#F9C350">The Art<br>of Doing<br>Science and<br>Engineering<br>&mdash;<br>Learning<br>to Learn</div>
      <div style="position:absolute;left:${mm(22)}px;bottom:${mm(22)}px;font:italic 400 ${mm(5.8)}px/1.2 'Hoefler Text';color:#F9C350">Richard<br>W. Hamming</div>`,
    spine: (size) => `<div style="${SPINE}justify-content:space-between;padding:${mm(11)}px 0;left:0;right:0;width:100%;color:#F9C350">
        <span style="font:400 ${size * 0.3}px/1.12 'Hoefler Text';text-align:left">The Art of Doing Science<br>and Engineering</span>
        <span style="font:italic 400 ${size * 0.3}px 'Hoefler Text'">Hamming</span></div>`,
  },
  everyone: {
    ground: '#0e0f11',
    front: (w, h) => `<svg width="${w}" height="${h}" style="position:absolute;inset:0">${dotRing(w * 0.72, h * 0.83, mm(13))}</svg>
      <div style="position:absolute;left:${mm(9)}px;top:${mm(9)}px;right:${mm(6)}px;font:700 ${mm(25)}px/.98 'Helvetica Neue';letter-spacing:-.025em;color:#fff">This<br>Is for<br>Every&shy;one</div>
      <div style="position:absolute;left:${mm(9)}px;top:${h * 0.62}px;font:500 ${mm(4.2)}px/1.25 'Helvetica Neue';color:#fff">The Unfinished Story of<br>the World Wide Web</div>
      <div style="position:absolute;left:${mm(9)}px;bottom:${mm(10)}px;font:600 ${mm(5.6)}px/1.25 'Helvetica Neue';color:#fff">Tim<br>Berners-Lee</div>`,
    spine: (size) => `<div style="${SPINE}justify-content:space-between;padding:${mm(9)}px 0;left:0;right:0;width:100%;color:#fff">
        <span style="font:700 ${size * 0.5}px 'Helvetica Neue';letter-spacing:-.02em">This Is for Everyone</span>
        <span style="font:600 ${size * 0.17}px/1.12 'Helvetica Neue';text-align:right">Tim<br>Berners-Lee</span></div>`,
  },
}

mkdirSync('public/study/covers', { recursive: true })
// Remotion's own headless shell, so this needs no browser of its own.
const browser = await chromium.launch({ executablePath: process.env.CHROME_SHELL })
for (const [key, jacket] of Object.entries(JACKETS)) {
  const cover = covers[key]
  const width = Math.round(cover.width * PX_PER_M)
  const height = Math.round(cover.height * PX_PER_M)
  const at = (u) => Math.round(u * width)
  const spineX = at(cover.u_spine[0])
  const spineW = at(cover.u_spine[1]) - spineX
  const frontX = at(cover.u_front[0])
  const frontW = width - frontX
  const linen = jacket.linen
    ? `background-image:repeating-linear-gradient(0deg,rgba(255,255,255,.035) 0 1px,transparent 1px 3px),repeating-linear-gradient(90deg,rgba(0,0,0,.09) 0 1px,transparent 1px 3px);`
    : ''
  const page = await browser.newPage({ viewport: { width, height } })
  await page.setContent(`<!doctype html><body style="margin:0;background:${jacket.ground};${linen}width:${width}px;height:${height}px;overflow:hidden;position:relative">
    <div style="position:absolute;left:${spineX}px;width:${spineW}px;top:0;bottom:0">${jacket.spine(spineW)}</div>
    <div style="position:absolute;left:${frontX}px;width:${frontW}px;top:0;bottom:0;overflow:hidden">${jacket.front(frontW, height)}</div>
  </body>`)
  await page.evaluate(() => document.fonts.ready)
  await page.screenshot({ path: `public/study/covers/${key}.jpg`, type: 'jpeg', quality: 88 })
  await page.close()
  console.log(key, width, height, 'spine', spineX, spineW)
}
await browser.close()
