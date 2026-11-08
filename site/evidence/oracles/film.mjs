// SOURCING: ffprobe and ffmpeg do the measuring (stream facts, ssim, atom order, frames as raw RGB). The flash count applies WCAG 2.3.1's definitions to those frames; nothing packaged here does that from the command line.
//
// The film as files, a static oracle: what was exported, whether its last frame is
// the still the app takes over from, whether its cuts stay under three flashes a
// second, and whether the captions say what the narration says.
//
//   node evidence/oracles/film.mjs
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const FILM = fileURLToPath(new URL('../../public/film/', import.meta.url))
const TMP = mkdtempSync(join(tmpdir(), 'film-oracle-'))
const LIMIT = 25 * 1024 * 1024 // Cloudflare's limit for one Workers asset.

const failures = []
const check = (claim, ok, detail = '') => {
  console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${claim}${detail ? ` (${detail})` : ''}`)
  if (!ok) failures.push(`${claim} ${detail}`)
}

const probe = (file) =>
  JSON.parse(
    execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file]),
  )

/** The container's index comes before the media, so a browser can start while it downloads. */
const faststart = (file) => {
  const { stderr } = spawnSync('ffprobe', ['-v', 'trace', file], { encoding: 'utf8', maxBuffer: 1 << 28 })
  const atoms = [...stderr.matchAll(/type:'(moov|mdat)'/g)].map((match) => match[1])
  return atoms[0] === 'moov'
}

const ssim = (a, b, width, height) => {
  const { stderr } = spawnSync(
    'ffmpeg',
    ['-v', 'info', '-i', a, '-i', b, '-lavfi',
      `[0:v]scale=${width}:${height},format=yuv420p[a];[1:v]scale=${width}:${height},format=yuv420p[b];[a][b]ssim`,
      '-f', 'null', '-'],
    { encoding: 'utf8' },
  )
  return Number(stderr.match(/All:([\d.]+)/)?.[1] ?? 0)
}

const frameAt = (file, args, name) => {
  const out = join(TMP, name)
  execFileSync('ffmpeg', ['-y', '-v', 'error', ...args, '-i', file, '-frames:v', '1', out])
  return out
}
const lastFrame = (file, name) => {
  const out = join(TMP, name)
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-sseof', '-0.2', '-i', file, '-update', '1', out])
  return out
}

const linear = (value) => {
  const c = value / 255
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
}

/** Mean relative luminance per frame, for each tile of a TILES x TILES grid. */
const TILES = 4
function luminance(file) {
  const size = TILES * 8
  const raw = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', file, '-vf', `scale=${size}:${size},format=rgb24`, '-f', 'rawvideo', '-'],
    { maxBuffer: 1 << 30 },
  )
  const frameBytes = size * size * 3
  const series = Array.from({ length: TILES * TILES }, () => [])
  for (let frame = 0; frame + frameBytes <= raw.length; frame += frameBytes) {
    const sums = new Float64Array(TILES * TILES)
    for (let y = 0; y < size; y++)
      for (let x = 0; x < size; x++) {
        const at = frame + (y * size + x) * 3
        const l = 0.2126 * linear(raw[at]) + 0.7152 * linear(raw[at + 1]) + 0.0722 * linear(raw[at + 2])
        sums[Math.floor(y / 8) * TILES + Math.floor(x / 8)] += l
      }
    sums.forEach((sum, tile) => series[tile].push(sum / 64))
  }
  return series
}

/**
 * WCAG 2.3.1's general flash: a pair of opposing changes of at least 10% of the
 * maximum relative luminance, where the darker image is below 0.80. Returns the
 * frames where a qualifying change completes.
 */
function changes(series) {
  const found = []
  let anchor = series[0]
  let direction = 0
  for (let frame = 1; frame < series.length; frame++) {
    const value = series[frame]
    const moved = value - anchor
    if (direction !== 0 && Math.sign(moved) === direction) {
      anchor = value
    } else if (Math.abs(moved) >= 0.1) {
      if (Math.min(value, anchor) < 0.8) found.push(frame)
      direction = Math.sign(moved)
      anchor = value
    }
  }
  return found
}

/** The most flashes in any one second, for a list of change frames. */
const worstSecond = (frames, fps) => {
  let worst = 0
  for (const start of frames) {
    const inside = frames.filter((frame) => frame >= start && frame < start + fps).length
    worst = Math.max(worst, Math.floor(inside / 2))
  }
  return worst
}

const sizes = { desktop: [1920, 1080], phone: [780, 1440] }

for (const [layout, [width, height]] of Object.entries(sizes)) {
  console.log(`\n${layout}`)
  const file = `${FILM}theorem-${layout}.mp4`
  const still = `${FILM}final-${layout}.png`
  check('exported', existsSync(file) && existsSync(still))
  const { streams, format } = probe(file)
  const video = streams.find((stream) => stream.codec_type === 'video')
  const audio = streams.find((stream) => stream.codec_type === 'audio')
  const seconds = Number(format.duration)
  check('about twenty seconds', Math.abs(seconds - 20) <= 0.5, `${seconds.toFixed(2)} s`)
  check('the right size', video.width === width && video.height === height, `${video.width}x${video.height}`)
  check('plays anywhere', video.codec_name === 'h264' && video.pix_fmt === 'yuv420p', `${video.codec_name} ${video.pix_fmt}`)
  check('has a voice track', audio?.codec_name === 'aac' && audio.sample_rate === '48000', audio?.codec_name)
  check('starts while downloading', faststart(file))
  const bytes = statSync(file).size
  check('fits one Workers asset', bytes < LIMIT, `${(bytes / 1048576).toFixed(1)} MiB`)

  const last = lastFrame(file, `last-${layout}.png`)
  const match = ssim(last, still, width, height)
  check('its last frame is the still', match >= 0.97, `ssim ${match.toFixed(4)}`)
  const stillSize = probe(still).streams[0]
  check('the still is the same size', stillSize.width === width && stillSize.height === height, `${stillSize.width}x${stillSize.height}`)

  const series = luminance(file)
  const fps = 30
  const perTile = series.map((tile) => worstSecond(changes(tile), fps))
  const flashing = perTile.filter((count) => count > 3).length
  const worst = Math.max(...perTile)
  check(
    'no more than three flashes a second over a quarter of the frame',
    flashing < (TILES * TILES) / 4,
    `worst tile ${worst}, ${flashing} of ${TILES * TILES} tiles over`,
  )
  const whole = series[0].map((_, frame) => series.reduce((sum, tile) => sum + tile[frame], 0) / series.length)
  const overall = worstSecond(changes(whole), fps)
  check('no more than three flashes a second over the whole frame', overall <= 3, String(overall))

  const ambient = `${FILM}ambient-${layout}.mp4`
  const loop = probe(ambient)
  check('ambient is silent', !loop.streams.some((stream) => stream.codec_type === 'audio'))
  check('ambient starts while downloading', faststart(ambient))
  const seam = ssim(
    frameAt(ambient, [], `ambient-first-${layout}.png`),
    lastFrame(ambient, `ambient-last-${layout}.png`),
    width,
    height,
  )
  check('ambient loops without a jump', seam >= 0.97, `ssim ${seam.toFixed(4)}`)
  const poster = `${FILM}poster-${layout}.jpg`
  const opening = ssim(poster, frameAt(ambient, [], `ambient-open-${layout}.png`), width, height)
  check('the poster is where ambient opens', opening >= 0.97, `ssim ${opening.toFixed(4)}`)
}

console.log('\nwords')
const vtt = readFileSync(`${FILM}captions.vtt`, 'utf8')
const cues = [...vtt.matchAll(/(\d\d):(\d\d)\.(\d{3}) --> (\d\d):(\d\d)\.(\d{3})[^\n]*\n([\s\S]*?)(?:\n\n|$)/g)].map(
  (match) => ({
    from: Number(match[1]) * 60 + Number(match[2]) + Number(match[3]) / 1000,
    to: Number(match[4]) * 60 + Number(match[5]) + Number(match[6]) / 1000,
    text: match[7].trim(),
  }),
)
const words = (text) => text.split(/\s+/).filter(Boolean)
const transcript = readFileSync(`${FILM}transcript.txt`, 'utf8')
check('captions exist', cues.length > 0, `${cues.length} cues`)
check(
  'captions say what the transcript says',
  words(cues.map((cue) => cue.text).join(' ')).join(' ') === words(transcript).join(' '),
)
check('narration is forty words', words(transcript).length === 40, String(words(transcript).length))
check('every cue ends inside the film', cues.every((cue) => cue.to <= 20))
check(
  'every cue is readable: two lines at most, at most 42 characters a line',
  cues.every((cue) => {
    const lines = cue.text.split('\n')
    return lines.length <= 2 && lines.every((line) => line.length <= 42)
  }),
)
const fastest = Math.max(...cues.map((cue) => cue.text.length / (cue.to - cue.from)))
check('no cue asks for more than 20 characters a second', fastest <= 20, `${fastest.toFixed(1)} chars/s`)

console.log(failures.length ? `\n${failures.length} failed:\n${failures.join('\n')}` : '\nAll passed.')
process.exit(failures.length ? 1 : 0)
