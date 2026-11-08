// SOURCING: Playwright drives the study's story and the real page; ffmpeg's ssim and blend filters compare the pictures and make the collage. This only names the claims.
//
// The tube as one display, as a static, motion and interaction oracle: its light on
// the desk follows the picture (a dark loop gives little, the app's bright recording a
// lot), the halo on the glass round the raster follows it too, the glass's own
// reflections show over a bright picture and a dark one alike, and at the handoff the
// film's last frame on the tube and the live app on the glass carry the same edge
// shading, so the two pictures agree. Writes the film-and-app collage.
//
//   PLAYWRIGHT_BROWSERS_PATH=0 node evidence/oracles/crt.mjs
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright'

const BASE = process.env.BASE ?? 'http://localhost:3100'
const RENDERS = fileURLToPath(new URL('../renders/crt/', import.meta.url))
const COLLAGES = fileURLToPath(new URL('../collages/crt@2026-11-08/', import.meta.url))
mkdirSync(RENDERS, { recursive: true })
mkdirSync(COLLAGES, { recursive: true })

const browser = await chromium.launch({
  args: ['--use-gl=angle', '--use-angle=metal', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'],
})
let failed = 0
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}${detail !== '' ? ` (${detail})` : ''}`)
  if (!ok) failed++
}

const story = async (query) => {
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage()
  const errors = []
  page.on('pageerror', (error) => errors.push(error.message))
  await page.goto(`${BASE}/story/study${query}`)
  await page.waitForFunction(() => window.__study?.camera)
  // The light eases toward the picture over a quarter second; give it time to land.
  await page.waitForTimeout(3500)
  return { page, errors }
}
const lightOf = (page) => page.evaluate(() => window.__study.screenLight())
const haloOf = (page) =>
  page.evaluate(() => window.__study.scene.getObjectByName('ScreenHalo')?.material.uniforms.haloColor.value.r ?? null)

console.log('light and halo follow the picture')
{
  const bright = await story('?at=experience&held')
  const dark = await story('?at=experience&held&tube=ambient')
  const [b, d] = [await lightOf(bright.page), await lightOf(dark.page)]
  const [hb, hd] = [await haloOf(bright.page), await haloOf(dark.page)]
  check('a fresh load is clean', bright.errors.length + dark.errors.length === 0, [...bright.errors, ...dark.errors].join(' | '))
  check('a bright picture lights the desk', b > 2, b?.toFixed(3))
  check('a dark picture lights it far less', d < b * 0.35, `${d?.toFixed(3)} against ${b?.toFixed(3)}`)
  check('the halo follows the picture', hb > 0 && hd < hb * 0.35, `${hd?.toFixed(4)} against ${hb?.toFixed(4)}`)
  await bright.page.screenshot({ path: `${RENDERS}film-bright.png` })
  await dark.page.screenshot({ path: `${RENDERS}film-dark.png` })
  // The light is still moving with a playing picture.
  const playing = await story('?at=opening')
  const a = await lightOf(playing.page)
  await playing.page.waitForTimeout(900)
  check('the light moves with a playing film', a !== (await lightOf(playing.page)))
  await playing.page.screenshot({ path: `${RENDERS}opening.png` })
  for (const { page } of [bright, dark, playing]) await page.context().close()
}

console.log('the glass reflects the room whatever the picture')
{
  /** The film held on one frame, and the raster's box on screen. */
  const still = (page) =>
    page.evaluate(() => {
      const { scene, camera } = window.__study
      let raster = null
      scene.traverse((o) => {
        if (o.isMesh && o.material?.isMeshPhysicalMaterial && o.material.emissiveMap?.image instanceof HTMLVideoElement) raster = o
      })
      raster.material.emissiveMap.image.pause()
      raster.geometry.computeBoundingBox()
      const { min, max } = raster.geometry.boundingBox
      const xs = []
      const ys = []
      for (const x of [min.x, max.x]) for (const y of [min.y, max.y]) for (const z of [min.z, max.z]) {
        const p = raster.position.clone().set(x, y, z).applyMatrix4(raster.matrixWorld).project(camera)
        xs.push(((p.x + 1) / 2) * innerWidth)
        ys.push(((1 - p.y) / 2) * innerHeight)
      }
      const [x, y] = [Math.ceil(Math.min(...xs)), Math.ceil(Math.min(...ys))]
      return { x, y, width: Math.floor(Math.max(...xs)) - x, height: Math.floor(Math.max(...ys)) - y }
    })
  /** The glass with its reflections pinned off (true) or given back (false): the frame loop's own writes go nowhere meanwhile. */
  const reflections = (page, off) =>
    page.evaluate((off) => {
      window.__study.scene.traverse((o) => {
        if (!(o.isMesh && o.material?.isMeshPhysicalMaterial && o.material.emissiveMap)) return
        if (off) Object.defineProperty(o.material, 'specularIntensity', { configurable: true, get: () => 0, set() {} })
        else {
          delete o.material.specularIntensity
          o.material.specularIntensity = 1
        }
      })
    }, off)
  /** Mean luma difference between two shots, 0 to 255. */
  const apart = (a, b) => {
    const { stderr } = spawnSync('ffmpeg', ['-v', 'info', '-i', a, '-i', b, '-lavfi',
      '[0:v]format=rgb24[a];[1:v]format=rgb24[b];[a][b]blend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG', '-f', 'null', '-'], { encoding: 'utf8' })
    return Number(stderr.match(/YAVG=([\d.]+)/)?.[1] ?? 0)
  }
  const seen = {}
  for (const [name, query] of [['bright', '?at=experience&held'], ['dark', '?at=experience&held&tube=ambient']]) {
    const { page } = await story(query)
    const clip = await still(page)
    await page.waitForTimeout(300)
    const on = `${RENDERS}reflections-${name}-on.png`
    const off = `${RENDERS}reflections-${name}-off.png`
    await page.screenshot({ path: on, clip })
    await reflections(page, true)
    await page.waitForTimeout(300)
    await page.screenshot({ path: off, clip })
    await reflections(page, false)
    await page.waitForTimeout(300)
    // The control: given back, the glass shoots as it did, so what the pair differs by is the reflections.
    const again = `${RENDERS}reflections-${name}-again.png`
    await page.screenshot({ path: again, clip })
    seen[name] = { by: apart(on, off), noise: apart(on, again) }
    await page.context().close()
  }
  const shows = ({ by, noise }) => by >= 1 && by >= 10 * noise
  const told = ({ by, noise }) => `${by.toFixed(2)}, noise ${noise.toFixed(2)}`
  check('the reflections show over the bright picture', shows(seen.bright), told(seen.bright))
  check('and over the dark one', shows(seen.dark), told(seen.dark))
}

const TUBE = '1014:732'
/** A shot cropped to the tube's own box at that moment, at the app's logical size: the camera may still be settling. */
const normalise = (shot, { x, y, width, height }, out) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', shot, '-vf', `crop=${width}:${height}:${x}:${y},scale=${TUBE}`, '-frames:v', '1', out])
/** With `ring`, the middle is blacked out of both, so only the edge shading is compared. */
const ssim = (a, b, ring = false) => {
  const middle = ring ? ',drawbox=x=iw*0.1:y=ih*0.12:w=iw*0.8:h=ih*0.76:color=black:t=fill' : ''
  const { stderr } = spawnSync('ffmpeg', ['-v', 'info', '-i', a, '-i', b, '-lavfi',
    `[0:v]format=yuv420p${middle}[a];[1:v]format=yuv420p${middle}[b];[a][b]ssim`, '-f', 'null', '-'], { encoding: 'utf8' })
  return Number(stderr.match(/All:([\d.]+)/)?.[1] ?? 0)
}
const collage = (a, b, out) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', a, '-i', b, '-filter_complex',
    `[0:v]format=rgb24,split[a][a2];[1:v]format=rgb24,split[b][b2];` +
    `[a2][b2]blend=all_mode=difference,lutrgb=r='val*4':g='val*4':b='val*4'[d];[a][b][d]hstack=inputs=3`,
    '-frames:v', '1', out])

console.log('the film hands the tube to the app')
{
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light' })).newPage()
  page.on('pageerror', (error) => check('no page error', false, error.message))
  await page.goto(`${BASE}/story/experience`)
  await page.waitForSelector('.stage', { state: 'attached', timeout: 30_000 })
  await page.waitForTimeout(400)
  await page.getByRole('button', { name: /Watch and explore/ }).first().press('Enter')
  await page.waitForFunction(() => document.querySelector('.stage').dataset.phase === 'watching')
  // The app fades in over the film's last frame as soon as the tube is up; held back, the tube shows that frame alone.
  const held = await page.addStyleTag({ content: '.room-tube { visibility: hidden !important }' })
  await page.waitForFunction(() => document.querySelector('.room').dataset.tube === 'true', null, { timeout: 90_000, polling: 'raf' })
  const boxOf = () =>
    page.evaluate(() => {
      const r = document.querySelector('.room-tube').getBoundingClientRect()
      const glass = document.querySelector('.room').dataset.glass
      return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height), glass }
    })
  const filmBox = await boxOf()
  await page.screenshot({ path: `${RENDERS}handoff-film-page.png` })
  check('the film is still on the tube', filmBox.glass === 'off', filmBox.glass)
  await held.evaluate((node) => node.remove())
  await page.waitForFunction(() => document.querySelector('.room').dataset.glass === 'on', null, { timeout: 15_000 })
  await page.waitForTimeout(900)
  const appBox = await boxOf()
  await page.screenshot({ path: `${RENDERS}handoff-app-page.png` })
  const [film, app] = [`${RENDERS}handoff-film.png`, `${RENDERS}handoff-app.png`]
  normalise(`${RENDERS}handoff-film-page.png`, filmBox, film)
  normalise(`${RENDERS}handoff-app-page.png`, appBox, app)
  // The fixture's film ends on an empty thread and its app shows a note and a message box, so the whole picture differs in content.
  const whole = ssim(film, app)
  const edge = ssim(film, app, true)
  check('the film\'s last frame and the app on the glass agree', whole >= 0.85, `ssim ${whole.toFixed(4)}`)
  check('their edge shading agrees', edge >= 0.9, `ssim ${edge.toFixed(4)}`)
  collage(film, app, `${COLLAGES}film-and-app.png`)
  await page.context().close()
}

await browser.close()
if (failed > 0) {
  console.log(`${failed} failed`)
  process.exit(1)
}
console.log('all passed')
