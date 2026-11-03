// SOURCING: bun:test over the media handler's panel and card, rendered with
// React into happy-dom against the in-memory workspace and real image, sound
// and video files.
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { act } from 'react'
import type { WorkspaceEntry } from '@/lib/workspace/types'
import { recordHostCalls, useDesktopEnv } from '../../../../test/desktop'
import {
  cleanup,
  fakeWorkspace,
  render,
  waitFor,
} from '../../../../test/workspace'
import { MediaCard, MediaPanel } from './media-handler'

const fixture = (name: string) =>
  Bun.file(
    new URL(`../../../../test/fixtures/handlers/${name}`, import.meta.url),
  ).bytes()

const FILES = {
  'media/page.png': await fixture('page.png'),
  'media/voice.wav': await fixture('voice.wav'),
  'media/clip.mp4': await fixture('clip.mp4'),
  'notes.txt': 'not media',
}

const entry = (path: string): WorkspaceEntry => ({
  id: `vf_${path}`,
  path,
  kind: 'file',
  size: 1,
  mtimeMs: 1,
})

afterEach(cleanup)

const view = (path: string) => {
  const ws = fakeWorkspace(FILES)
  return { ws, props: { client: ws.client, path, entry: entry(path) } }
}

/** The blob: URL's bytes and type, as the element would load them. */
async function blobAt(url: string) {
  const blob = await (await fetch(url)).blob()
  return { type: blob.type, bytes: new Uint8Array(await blob.arrayBuffer()) }
}

describe('MediaPanel', () => {
  test.each([
    ['media/page.png', 'img', 'image/png'],
    ['media/voice.wav', 'audio', 'audio/wav'],
    ['media/clip.mp4', 'video', 'video/mp4'],
  ] as const)('%s plays in <%s>', async (path, tag, type) => {
    const { props } = view(path)
    const { container } = await render(<MediaPanel {...props} />)
    const element = await waitFor(() =>
      container.querySelector<HTMLMediaElement | HTMLImageElement>(tag),
    )
    expect(element.src).toStartWith('blob:')
    expect(await blobAt(element.src)).toEqual({ type, bytes: FILES[path] })
    if (tag !== 'img') expect((element as HTMLMediaElement).controls).toBe(true)
  })

  test('a file the platform cannot show says so', async () => {
    const { props } = view('media/clip.mp4')
    const { container } = await render(<MediaPanel {...props} />)
    const video = await waitFor(() => container.querySelector('video'))
    act(() => {
      video.dispatchEvent(new Event('error'))
    })
    await waitFor(() =>
      container.textContent.includes('This file cannot be shown here.'),
    )
    expect(container.querySelector('video')).toBeNull()
    // Without the desktop host there is nowhere else to open it.
    expect(container.querySelector('button')).toBeNull()
  })

  test('opened with this view, a file that is not media says so', async () => {
    const { props } = view('notes.txt')
    const { container } = await render(<MediaPanel {...props} />)
    await waitFor(() =>
      container.textContent.includes('This file cannot be shown here.'),
    )
  })

  describe('on the desktop', () => {
    useDesktopEnv()
    let host: ReturnType<typeof recordHostCalls>
    beforeEach(() => {
      host = recordHostCalls()
    })
    afterEach(() => host.restore())

    test('a file that cannot be shown opens in its default app', async () => {
      const { props } = view('media/voice.wav')
      const { container } = await render(<MediaPanel {...props} />)
      const audio = await waitFor(() => container.querySelector('audio'))
      act(() => {
        audio.dispatchEvent(new Event('error'))
      })
      const button = await waitFor(() => container.querySelector('button'))
      expect(button.textContent).toBe('Open in its default app')
      act(() => button.click())
      await waitFor(() => host.calls.length === 1)
      expect(host.calls).toEqual([
        {
          method: 'openWithDefault',
          params: { path: '/tmp/vault/media/voice.wav' },
        },
      ])
    })
  })
})

describe('MediaCard', () => {
  const card = async (path: string) => {
    const { props } = view(path)
    return (await render(<MediaCard {...props} zoom={1} selected={false} />))
      .container
  }

  test('an image is its own thumbnail', async () => {
    const container = await card('media/page.png')
    const img = await waitFor(() => container.querySelector('img'))
    expect(img.src).toStartWith('blob:')
    expect(img.alt).toBe('page.png')
    expect(img.className).toContain('object-cover')
  })

  test('a video shows a frame from its start', async () => {
    const container = await card('media/clip.mp4')
    const video = await waitFor(() => container.querySelector('video'))
    expect(video.getAttribute('src')).toMatch(/^blob:.*#t=0\.1$/)
    expect(video.getAttribute('preload')).toBe('metadata')
    expect(video.muted).toBe(true)
    expect(video.controls).toBe(false)
  })

  test('a sound shows its name and a player', async () => {
    const container = await card('media/voice.wav')
    const audio = await waitFor(() => container.querySelector('audio'))
    expect(container.textContent).toContain('voice.wav')
    expect(audio.controls).toBe(true)
    // The canvas leaves the player's clicks alone.
    expect(audio.className).toContain('nodrag')
  })

  test('a file that cannot be shown leaves its name', async () => {
    const container = await card('media/page.png')
    const img = await waitFor(() => container.querySelector('img'))
    act(() => {
      img.dispatchEvent(new Event('error'))
    })
    await waitFor(() => !container.querySelector('img'))
    expect(container.textContent).toBe('page.png')
  })
})
