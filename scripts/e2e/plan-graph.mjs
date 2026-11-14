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

/** Drags a task by (dx, dy) with the mouse, as a person would, and reads where it and its edges ended up. */
async function dragTask(page, root, label, dx, dy) {
  const node = root.locator('.react-flow__node', { hasText: label })
  const before = await node.boundingBox()
  const x = before.x + before.width / 2
  const y = before.y + before.height / 2
  await page.mouse.move(x, y)
  await page.mouse.down()
  for (let step = 1; step <= 10; step++)
    await page.mouse.move(x + (dx * step) / 10, y + (dy * step) / 10)
  await page.mouse.up()
  await page.waitForTimeout(300)
  const after = await node.boundingBox()
  const id = await node.getAttribute('data-id')
  // Where each edge touching the task meets it, and where the handle it should meet sits, in page coordinates.
  const edges = await root.evaluate((element, task) => {
    const at = (path, length) => {
      const point = path.getPointAtLength(length)
      const m = path.getScreenCTM()
      return {
        x: point.x * m.a + point.y * m.c + m.e,
        y: point.x * m.b + point.y * m.d + m.f,
      }
    }
    const node = element.querySelector(`.react-flow__node[data-id="${task}"]`)
    // The task's handle of this kind nearest the edge's end: the one the edge meets.
    const handle = (kind, end) => {
      const [nearest] = [
        ...node.querySelectorAll(`.react-flow__handle.${kind}`),
      ]
        .map((found) => {
          const box = found.getBoundingClientRect()
          const hx = box.x + box.width / 2
          const hy = box.y + box.height / 2
          return {
            handleSide: /react-flow__handle-(left|right|top|bottom)/.exec(
              found.className,
            )?.[1],
            hx,
            hy,
            distance: Math.hypot(end.x - hx, end.y - hy),
          }
        })
        .sort((a, b) => a.distance - b.distance)
      return { ...end, ...nearest }
    }
    return {
      direction: element
        .querySelector('[data-plan-direction]')
        ?.getAttribute('data-plan-direction'),
      ends: [...element.querySelectorAll('.react-flow__edge')].flatMap(
        (edge) => {
          const [source, target] = (edge.getAttribute('data-id') ?? '').split(
            '->',
          )
          const path = edge.querySelector('.react-flow__edge-path')
          if (source === task)
            return [{ side: 'out', ...handle('source', at(path, 0)) }]
          if (target === task)
            return [
              {
                side: 'in',
                ...handle('target', at(path, path.getTotalLength())),
              },
            ]
          return []
        },
      ),
    }
  }, id)
  return { before, after, ...edges }
}

const FACING = {
  RIGHT: { in: 'left', out: 'right' },
  DOWN: { in: 'top', out: 'bottom' },
}

/** Every edge touching the task meets it at its handle, and the handles sit on the sides the layout faces. */
const attached = ({ direction, ends }) =>
  ends.length > 0 &&
  ends.every(
    (end) =>
      end.handleSide === FACING[direction]?.[end.side] &&
      Math.hypot(end.x - end.hx, end.y - end.hy) <= 6,
  )

const describeEnds = ({ direction, ends }) =>
  `${direction}: ` +
  ends
    .map(
      (end) =>
        `${end.side} on ${end.handleSide}, ${Math.hypot(end.x - end.hx, end.y - end.hy).toFixed(1)}px from its handle`,
    )
    .join('; ')

/** Moved with the pointer: React Flow starts a drag past its threshold, so the first pointer step does not count. */
const followed = (moved, asked) =>
  moved * Math.sign(asked) >= Math.abs(asked) * 0.8 &&
  Math.abs(moved) <= Math.abs(asked) + 2

async function inlineDrag(page, card, scope, shot) {
  const flow = await card.locator('.react-flow').boundingBox()
  const moved = await dragTask(page, card, 'Front door tools', 40, 24)
  check(
    `${scope}: a task drags in the card`,
    followed(moved.after.x - moved.before.x, 40) &&
      followed(moved.after.y - moved.before.y, 24),
    `moved ${(moved.after.x - moved.before.x).toFixed(1)}, ${(moved.after.y - moved.before.y).toFixed(1)}`,
  )
  check(
    `${scope}: a drag does not open the workspace`,
    (await page.locator('[data-plan-workspace]').count()) === 0,
  )
  check(
    `${scope}: the dragged task's edges follow it`,
    attached(moved),
    describeEnds(moved),
  )
  const far = await dragTask(page, card, 'Friction regression check', 600, 400)
  const right = flow.x + flow.width - (far.after.x + far.after.width)
  const bottom = flow.y + flow.height - (far.after.y + far.after.height)
  check(
    `${scope}: a task dragged hard stops at the card's edge`,
    right >= -1 && bottom >= -1 && right <= 8 && bottom <= 8,
    `${right.toFixed(1)}px from the right, ${bottom.toFixed(1)}px from the bottom`,
  )
  await shot('card-dragged')
  await card
    .locator('.react-flow__node', { hasText: 'Front door tools' })
    .click()
  const dialog = page.locator('[data-plan-workspace]')
  await dialog.waitFor()
  check(
    `${scope}: a click after dragging still opens the task`,
    (await dialog
      .locator('section[aria-label^="Consolidate the pinned front door"]')
      .count()) === 1,
  )
  await page.keyboard.press('Escape')
  await dialog.waitFor({ state: 'detached' })
}

async function workspaceDrag(page, dialog, scope) {
  const moved = await dragTask(page, dialog, 'Error guidance', -30, 40)
  check(
    `${scope}: a task drags in the workspace, its edges following`,
    followed(moved.after.x - moved.before.x, -30) &&
      followed(moved.after.y - moved.before.y, 40) &&
      attached(moved),
    `moved ${(moved.after.x - moved.before.x).toFixed(1)}, ${(moved.after.y - moved.before.y).toFixed(1)}; ${describeEnds(moved)}`,
  )
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
  await inlineDrag(page, card, scope, shot)

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
  await workspaceDrag(page, dialog, `${scope} workspace`)
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
  const rows = await list.locator('button').evaluateAll((buttons) =>
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
  await workspaceDrag(page, dialog, `${scope} workspace`)
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
