// Composes one collage per story for the HITL seal: the outside references
// the ledger names for it, the story's render, and what the shot driver
// observed (the action an interaction story emitted, the motion a running
// story showed). Every reference is in the translation lane (different
// content, re-expressed in the terminal), so the collage carries no
// perceptual diff against it; the committed renders are the baselines a
// later change diffs against.
//
//   node scripts/stories/collage.cjs http://localhost:3000 docs/plans/evidence/coding-module
const { chromium } = require('playwright')
const { readFileSync, existsSync } = require('node:fs')
const { join } = require('node:path')

const [base, dir] = process.argv.slice(2)
if (!base || !dir) {
  console.error('usage: collage.cjs <base-url> <evidence-dir>')
  process.exit(2)
}

const ledger = JSON.parse(readFileSync(join(dir, 'ledger.json'), 'utf8'))
const oracleFile = join(dir, 'renders', 'oracle.json')
const oracle = existsSync(oracleFile)
  ? JSON.parse(readFileSync(oracleFile, 'utf8'))
  : {}
const image = (path) =>
  `data:image/png;base64,${readFileSync(join(dir, path)).toString('base64')}`
const escape = (text) =>
  String(text).replace(/[&<>"]/g, (c) => `&#${c.charCodeAt(0)};`)

function page(story, listed) {
  const refs = story.refs.map((id) =>
    ledger.references.find((r) => r.id === id),
  )
  const recorded = oracle[story.id] ?? {}
  const left = refs.length
    ? refs
        .map(
          (r) => `<figure><img src="${image(r.file)}">
          <figcaption><b>${escape(r.file)}</b> · ${escape(r.author)} · ${escape(r.license)}<br>${escape(r.translated_into)}</figcaption></figure>`,
        )
        .join('')
    : `<p class="none">No outside reference: this behavior is Theorem's own. The evidence is the action the story recorded.</p>`
  return `<!doctype html><meta charset="utf-8"><style>
    body{margin:0;padding:24px;background:#15181d;color:#d8dde3;font:14px/1.45 'DejaVu Sans',sans-serif;width:1880px}
    h1{font-size:20px;margin:0 0 6px}p{margin:0 0 6px;max-width:1500px}.meta{color:#8b949e}
    .row{display:flex;gap:32px;margin-top:16px;align-items:flex-start}
    .refs{width:900px;display:flex;flex-direction:column;gap:16px}
    figure{margin:0}img{display:block;max-width:900px;border:1px solid #2d333b}
    .render img{width:900px;height:640px}
    figcaption{color:#8b949e;font-size:12px;margin-top:6px;max-width:900px}
    .none{color:#8b949e;font-style:italic}
    code{font:12px 'DejaVu Sans Mono',monospace;color:#d6bc8a}
  </style>
  <h1>${escape(listed.title)}</h1>
  <p>${escape(listed.claim)}</p>
  <p class="meta">/story/${escape(story.id)} · lane: translation · no perceptual diff (see collage.cjs)</p>
  ${recorded.click ? `<p>Clicked <code>${escape(recorded.click)}</code>; the terminal emitted <code>${escape(JSON.stringify(recorded.action))}</code></p>` : ''}
  ${recorded.motion ? `<p>Motion: ${recorded.motion.pixels} pixels changed in ${recorded.motion.after_ms} ms, within <code>${escape(JSON.stringify(recorded.motion.box))}</code> (x0, y0, x1, y1 in CSS pixels)</p>` : ''}
  <div class="row"><section class="refs">${left}</section>
  <section class="render"><figure><img src="${image(`renders/${story.id}.png`)}"><figcaption><b>renders/${escape(story.id)}.png</b> · the story in the real WASM terminal</figcaption></figure></section></div>`
}

;(async () => {
  const browser = await chromium.launch()
  const tab = await browser.newPage({
    viewport: { width: 1928, height: 800 },
    deviceScaleFactor: 1,
  })
  const listed = await (await tab.request.get(`${base}/stories.json`)).json()
  for (const story of ledger.stories) {
    const entry = listed.find((s) => s.id === story.id)
    if (!entry) throw new Error(`${story.id} is not listed at /stories.json`)
    await tab.setContent(page(story, entry))
    await tab.screenshot({
      path: join(dir, 'collages', `${story.id}.png`),
      fullPage: true,
    })
    console.log('collage', story.id)
  }
  await browser.close()
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
