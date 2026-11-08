// SOURCING: hand-rolled, and a WebVTT file is a few lines. Writes the captions and the plain transcript from src/timeline.ts, so neither can drift from the film.
import { FPS, CUES, PHRASES } from '../src/timeline'

const stamp = (frame: number) => {
  const total = frame / FPS
  const minutes = Math.floor(total / 60)
  const seconds = total - minutes * 60
  return `${String(minutes).padStart(2, '0')}:${seconds.toFixed(3).padStart(6, '0')}`
}

// A caption line holds 42 characters: a cue stays on one line where it fits, otherwise
// it breaks into the two most even lines that do.
const LINE = 42
const lines = (text: string) => {
  if (text.length <= LINE) return text
  const words = text.split(' ')
  let best = ''
  for (let i = 1; i < words.length; i++) {
    const [a, b] = [words.slice(0, i).join(' '), words.slice(i).join(' ')]
    const longer = Math.max(a.length, b.length)
    if (longer <= LINE && (!best || longer < Math.max(...best.split('\n').map((l) => l.length)))) best = `${a}\n${b}`
  }
  if (!best) throw new Error(`A cue does not fit two caption lines: ${text}`)
  return best
}

// `line:84%` clears the player's control bar, which stays on screen for this film.
const vtt = CUES.map((cue) => `${stamp(cue.from)} --> ${stamp(cue.to)} line:84%\n${lines(cue.text)}`).join('\n\n')
const film = new URL('../../public/film/', import.meta.url).pathname.replaceAll('%20', ' ')
await Bun.write(`${film}captions.vtt`, `WEBVTT\n\n${vtt}\n`)
await Bun.write(`${film}transcript.txt`, `${PHRASES.map((line) => line.text).join('\n')}\n`)
