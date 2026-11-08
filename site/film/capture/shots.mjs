// SOURCING: ffmpeg. Pulls the stills the film's turn cuts between out of the real captures; run after capture.mjs.
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const state = JSON.parse(readFileSync(fileURLToPath(new URL('../state/thread.json', import.meta.url)), 'utf8'))
const OUT = fileURLToPath(new URL('../public/capture/', import.meta.url))
mkdirSync(`${OUT}shots`, { recursive: true })

const still = (video, seconds, name) =>
  execFileSync('ffmpeg', ['-y', '-v', 'error', '-ss', seconds.toFixed(2), '-i', `${OUT}${video}`, '-frames:v', '1', '-q:v', '2', `${OUT}shots/${name}.jpg`])

const { marks, typing, phone } = state
const during = (share) => marks.sent + (marks.answered - marks.sent) * share

still('typing-desktop.mp4', typing.seconds - 0.3, 'typed-desktop')
still('typing-desktop.mp4', 0.2, 'rail-desktop')
still('turn-desktop.mp4', during(0.4), 'early-desktop')
still('turn-desktop.mp4', during(0.95), 'mid-desktop')
still('turn-desktop.mp4', marks.done - 0.2, 'late-desktop')

still('typing-phone.mp4', phone.typing.seconds - 0.3, 'typed-phone')
still('typing-phone.mp4', 0.2, 'rail-phone')
still('thread-phone.mp4', phone.scroll.seconds * 0.3, 'early-phone')
still('thread-phone.mp4', phone.scroll.seconds * 0.6, 'mid-phone')
still('thread-phone.mp4', phone.scroll.seconds * 0.9, 'late-phone')
