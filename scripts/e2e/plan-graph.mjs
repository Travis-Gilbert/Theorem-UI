// SOURCING: playwright-core, which the story oracle already drives, over the plan card's stories (src/stories/fixtures/plan's eight-task plan), measured in a real browser: happy-dom does no layout, so only here does a clipped label or an overlap show.
//
// The plan card at desktop and phone widths, in light and dark: every task's
// label is whole inside its node, no two nodes overlap, the status mark sits
// in the label's first line, the objective holds to two lines until asked,
// and a narrow card lists the tasks instead. Screenshots go to the e2e shots
// directory. Needs only the dev server (bun run dev), not the stack:
//
//   STORY_ORIGIN=http://localhost:3000 node scripts/e2e/plan-graph.mjs
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'
import { chromium, devices } from 'playwright-core'
import { DATA_DIR } from './config.mjs'

const ORIGIN = process.env.STORY_ORIGIN ?? 'http://localhost:3000'
const SHOTS = join(DATA_DIR, 'shots')
mkdirSync(SHOTS, { recursive: true })

const failed = []
function check(name, passed, detail = '') {
  console.log(
    `${passed ? 'PASS' : 'FAIL'} ${name}${detail ? `  ${detail}` : ''}`,
  )
  if (!passed) failed.push(name)
}

const DESKTOP = { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 }
const PHONE = devices['iPhone 13']

/** Everything the card's geometry says, read in the page. */
const measure = (root) =>
  root.evaluate((card) => {
    const box = (element) => {
      const r = element.getBoundingClientRect()
      return {
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
        right: r.right,
        bottom: r.bottom,
      }
    }
    const flow = card.querySelector('.react-flow')
    return {
      flow: flow && box(flow),
      nodes: [...card.querySelectorAll('.react-flow__node')].map((node) => {
        const label = node.querySelector('[data-plan-label]')
        const mark = node.querySelector('[data-plan-mark]')
        const lineHeight = parseFloat(getComputedStyle(label).lineHeight)
        return {
          name: label.textContent,
          node: box(node),
          label: box(label),
          mark: box(mark),
          lineHeight,
          // Rendered size over laid-out size: how far fitView shrank the graph.
          scale: node.getBoundingClientRect().width / node.offsetWidth,
          clipped:
            label.scrollWidth > label.clientWidth + 0.5 ||
            label.scrollHeight > label.clientHeight + 0.5,
        }
      }),
      edges: [...card.querySelectorAll('.react-flow__edge-path')].map((path) =>
        path.getAttribute('d'),
      ),
    }
  })

const inside = (a, b) =>
  a.x >= b.x - 0.5 &&
  a.y >= b.y - 0.5 &&
  a.right <= b.right + 0.5 &&
  a.bottom <= b.bottom + 0.5
const overlap = (a, b) =>
  a.x < b.right && b.x < a.right && a.y < b.bottom && b.y < a.bottom

async function graphChecks(page, card, scope) {
  await card.locator('.react-flow:not(.opacity-0)').waitFor()
  await page.waitForTimeout(300)
  const g = await measure(card)
  check(`${scope}: eight task nodes`, g.nodes.length === 8, `${g.nodes.length}`)
  check(
    `${scope}: no label clipped`,
    g.nodes.every((n) => !n.clipped && inside(n.label, n.node)),
    g.nodes
      .filter((n) => n.clipped || !inside(n.label, n.node))
      .map((n) => n.name)
      .join(', '),
  )
  check(
    `${scope}: every node inside the graph's frame`,
    g.nodes.every((n) => inside(n.node, g.flow)),
    g.nodes
      .filter((n) => !inside(n.node, g.flow))
      .map((n) => n.name)
      .join(', '),
  )
  const pairs = g.nodes.flatMap((a, i) =>
    g.nodes
      .slice(i + 1)
      .filter((b) => overlap(a.node, b.node))
      .map((b) => `${a.name}/${b.name}`),
  )
  check(`${scope}: no two nodes overlap`, pairs.length === 0, pairs.join(', '))
  check(
    `${scope}: status is a mark in the label's first line, not a row`,
    g.nodes.every(
      (n) =>
        n.mark.right <= n.label.x + 0.5 &&
        n.mark.y >= n.label.y - 0.5 &&
        n.mark.bottom <= n.label.y + n.lineHeight * n.scale + 0.5,
    ),
    g.nodes
      .map(
        (n) =>
          `${n.name}: mark ${n.mark.y.toFixed(1)}-${n.mark.bottom.toFixed(1)} label ${n.label.y.toFixed(1)}`,
      )
      .join('; '),
  )
  check(
    `${scope}: nine edges, each on its own path`,
    g.edges.length === 9 && new Set(g.edges).size === 9,
    `${g.edges.length}`,
  )
  const scale = Math.min(...g.nodes.map((n) => n.scale))
  check(`${scope}: drawn at a readable scale`, scale >= 0.8, scale.toFixed(2))
  return g
}

async function run(story, name, options, scheme, scenario) {
  // A cloud box may ship a browser build other than the one playwright-core pins.
  const browser = await chromium.launch(
    process.env.CHROMIUM_PATH
      ? { executablePath: process.env.CHROMIUM_PATH }
      : {},
  )
  try {
    const context = await browser.newContext({
      ...options,
      colorScheme: scheme,
      reducedMotion: 'reduce',
    })
    const page = await context.newPage()
    const errors = []
    page.on('pageerror', (error) => errors.push(String(error).slice(0, 300)))
    await page.goto(`${ORIGIN}/story/${story}`, {
      waitUntil: 'domcontentloaded',
    })
    await page.waitForSelector('[data-story-ready]', {
      state: 'attached',
      timeout: 90_000,
    })
    const card = page.locator('[data-plan-card]')
    await card.waitFor()
    const scope = `${story} ${name} ${scheme}`
    const shot = (what, target = card) =>
      target.screenshot({
        path: join(SHOTS, `plan-${story}-${name}-${scheme}-${what}.png`),
      })
    await scenario({ page, card, scope, shot })
    check(`${scope}: no page errors`, errors.length === 0, errors.join(' | '))
  } finally {
    await browser.close()
  }
}

async function desktop({ page, card, scope, shot }) {
  await graphChecks(page, card, scope)
  const objective = card.locator('[data-plan-objective]')
  const clamp = await objective.evaluate((p) => ({
    height: p.getBoundingClientRect().height,
    line: parseFloat(getComputedStyle(p).lineHeight),
    clamped: p.scrollHeight > p.clientHeight + 1,
  }))
  check(
    `${scope}: objective held to two lines`,
    clamp.clamped && clamp.height <= clamp.line * 2 + 1,
    `${clamp.height}px`,
  )
  await shot('card')
  await card.getByRole('button', { name: 'Show all' }).click()
  const opened = await objective.evaluate((p) => ({
    height: p.getBoundingClientRect().height,
    clamped: p.scrollHeight > p.clientHeight + 1,
  }))
  check(
    `${scope}: Show all reads the whole objective`,
    !opened.clamped && opened.height > clamp.height,
    `${opened.height}px`,
  )
  await shot('objective-open')
  await card.getByRole('button', { name: 'Show less' }).click()

  await card.getByRole('button', { name: 'Expand plan' }).click()
  const dialog = page.locator('[data-plan-workspace]')
  await dialog.waitFor()
  await graphChecks(page, dialog, `${scope} workspace`)
  await page.waitForTimeout(400)
  await shot('workspace', page)
  await dialog
    .locator('.react-flow__node', { hasText: 'Continuity contract' })
    .click()
  const detail = dialog.locator(
    'section[aria-label^="Write the continuity contract"]',
  )
  await detail.waitFor()
  const title = await detail.locator('h4').textContent()
  check(
    `${scope} workspace: inspector shows the full title`,
    title ===
      'Write the continuity contract for resuming a session after compaction or a restart',
    title,
  )
  await shot('workspace-selected', page)
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
  check(`${scope}: Escape closes the workspace`, true)
}

async function phone({ page, card, scope, shot }) {
  const list = card.locator('ol')
  await list.waitFor()
  check(
    `${scope}: a narrow card lists the tasks instead of the graph`,
    (await card.locator('.react-flow').count()) === 0,
  )
  const rows = await list
    .locator('button')
    .evaluateAll((buttons) =>
      buttons.map((b) => ({
        height: b.getBoundingClientRect().height,
        clipped: b.scrollWidth > b.clientWidth + 0.5,
      })),
    )
  check(
    `${scope}: eight rows, each a 44px target, none clipped`,
    rows.length === 8 && rows.every((r) => r.height >= 44 && !r.clipped),
    rows.map((r) => r.height.toFixed(0)).join(','),
  )
  const header = await card.evaluate((c) => ({
    title: c.querySelector('h3').getBoundingClientRect().width,
    column: c
      .querySelector('[data-plan-objective]')
      .parentElement.getBoundingClientRect().width,
  }))
  check(
    `${scope}: the title takes the header's full width, the count below it`,
    header.title >= header.column - 1,
    `${header.title.toFixed(0)} of ${header.column.toFixed(0)}px`,
  )
  await shot('card')
  await list
    .getByRole('button', { name: /^Write the continuity contract/ })
    .click()
  const dialog = page.locator('[data-plan-workspace]')
  await dialog.waitFor()
  await dialog
    .locator('section[aria-label^="Write the continuity contract"]')
    .waitFor()
  const objective = await dialog
    .locator('[data-plan-objective]')
    .evaluate((p) => p.scrollHeight > p.clientHeight + 1)
  check(
    `${scope} workspace: the objective clamps, with Show all`,
    objective &&
      (await dialog.getByRole('button', { name: 'Show all' }).count()) === 1,
  )
  await page.waitForTimeout(400)
  await shot('workspace', page)
}

async function underWay({ page, card, scope, shot }) {
  await graphChecks(page, card, scope)
  const marks = await card
    .locator('[data-plan-mark]')
    .evaluateAll((m) => m.map((e) => e.getAttribute('data-plan-mark')))
  check(
    `${scope}: the deviating task has its own mark`,
    marks.includes('deviating') && marks.includes('active'),
    marks.join(','),
  )
  await shot('card')
}

for (const scheme of ['light', 'dark']) {
  await run('plan-card', 'desktop', DESKTOP, scheme, desktop)
  await run('plan-card', 'phone', PHONE, scheme, phone)
  await run('plan-card-under-way', 'desktop', DESKTOP, scheme, underWay)
}
console.log(`shots in ${SHOTS}`)
if (failed.length) {
  console.error(`${failed.length} failed`)
  process.exit(1)
}
