// Screenshots every story listed at /stories.json, the oracle's one driver.
// For a story that names keys, presses them first; for one that names text
// to click, clicks it after the shot and records the action the terminal
// emitted (the story route keeps it on data-action). For a running story,
// takes two frames 400 ms apart and records how many pixels moved and where.
// What it observed goes to oracle.json beside the shots.
//
// Needs Playwright with Chromium (preinstalled in the cloud container):
//   node scripts/stories/shoot.cjs http://localhost:3000 <out-dir> [scale]
const { chromium } = require('playwright')
const { writeFileSync } = require('node:fs')
const { join } = require('node:path')

const [base, out, scale = '2'] = process.argv.slice(2)
if (!base || !out) {
  console.error('usage: shoot.cjs <base-url> <out-dir> [scale]')
  process.exit(2)
}

/** Pixels that differ between two shots, and their bounding box in CSS pixels. */
function moved(page, a, b) {
  return page.evaluate(
    async ([a, b, scale]) => {
      const load = async (data) => {
        const img = new Image()
        img.src = `data:image/png;base64,${data}`
        await img.decode()
        const canvas = new OffscreenCanvas(img.width, img.height)
        const context = canvas.getContext('2d')
        context.drawImage(img, 0, 0)
        return context.getImageData(0, 0, img.width, img.height)
      }
      const [x, y] = await Promise.all([load(a), load(b)])
      let pixels = 0
      let box = null
      for (let i = 0; i < x.data.length; i += 4) {
        if (
          x.data[i] === y.data[i] &&
          x.data[i + 1] === y.data[i + 1] &&
          x.data[i + 2] === y.data[i + 2]
        )
          continue
        pixels += 1
        const px = (i / 4) % x.width
        const py = Math.floor(i / 4 / x.width)
        box = box
          ? [
              Math.min(box[0], px),
              Math.min(box[1], py),
              Math.max(box[2], px),
              Math.max(box[3], py),
            ]
          : [px, py, px, py]
      }
      return {
        after_ms: 400,
        pixels,
        box: box && box.map((v) => Math.round(v / scale)),
      }
    },
    [a.toString('base64'), b.toString('base64'), Number(scale)],
  )
}

;(async () => {
  const browser = await chromium.launch()
  const page = await browser.newPage({
    viewport: { width: 900, height: 640 },
    deviceScaleFactor: Number(scale),
  })
  const errors = []
  page.on('pageerror', (e) => errors.push(e.message))
  const stories = await (await page.request.get(`${base}/stories.json`)).json()
  const oracle = {}
  for (const story of stories) {
    await page.goto(`${base}${story.url}`, {
      waitUntil: 'networkidle',
      timeout: 120000,
    })
    const root = page.locator(`[data-story="${story.id}"]`)
    await root.waitFor({ timeout: 30000 })
    await page.waitForTimeout(1500)
    if (story.keys.length) {
      await page.locator('[aria-label="Agent terminal"]').focus()
      for (const key of story.keys) await page.keyboard.press(key)
      await page.waitForTimeout(300)
    }
    const first = await root.screenshot({ path: join(out, `${story.id}.png`) })
    const seen = {}
    if (story.running) {
      await page.waitForTimeout(400)
      seen.motion = await moved(page, first, await root.screenshot())
    }
    if (story.click) {
      await root.getByText(story.click).first().click()
      await page.waitForTimeout(300)
      const action = await root.getAttribute('data-action')
      seen.click = story.click
      seen.action = JSON.parse(action)
    }
    if (Object.keys(seen).length) oracle[story.id] = seen
    console.log('shot', story.id)
  }
  writeFileSync(
    join(out, 'oracle.json'),
    JSON.stringify(oracle, null, 2) + '\n',
  )
  await browser.close()
  if (errors.length) {
    console.error(errors.join('\n'))
    process.exit(1)
  }
})().catch((e) => {
  console.error(e)
  process.exit(1)
})
