// SOURCING: penpal 8 (connect + WindowMessenger), the child side of experience/bridge.ts. A deterministic stand-in for the app, used until the public demo is cleared: `?delay=ms` holds readiness, `?fail=reason` reports failure, `?silent` never answers the handshake.
import { connect, WindowMessenger } from 'penpal'
import { useEffect, useRef, useState } from 'react'
import { EMBED_PARAM, PROTOCOL } from '@/experience/bridge'
import type { AppMethods, SiteMethods } from '@/experience/bridge'

/**
 * One handshake per load, as the app's own side (src/lib/embed/site-bridge.tsx)
 * connects once at module scope. Strict mode runs this effect twice, and a second
 * connect on the same channel sends a late SYN that drops the finished handshake's
 * port, so ready() would never arrive.
 */
let opened = false

/** Everything the parent can observe is echoed here, so a check reads it off the page. */
export default function DemoFixtureStory() {
  const params = new URLSearchParams(location.search)
  const [active, setActive] = useState(false)
  const [focusAsked, setFocusAsked] = useState(0)
  const [draft, setDraft] = useState('')
  const box = useRef<HTMLTextAreaElement>(null)
  const focusPending = useRef(false)
  const draftRef = useRef('')
  draftRef.current = draft

  useEffect(() => {
    const embed = params.get(EMBED_PARAM)
    if (opened || !embed || params.has('silent')) return
    opened = true
    const [, channel] = embed.split('.')
    const methods: AppMethods = {
      activate({ focus }) {
        setActive(true)
        // The box takes focus once the render that lifts `inert` has committed (below): a frame callback could run first and land on an inert box.
        if (focus) {
          focusPending.current = true
          setFocusAsked((n) => n + 1)
        }
      },
      deactivate() {
        setActive(false)
      },
      setDraft(text) {
        if (draftRef.current.trim()) return { applied: false }
        setDraft(text)
        return { applied: true }
      },
    }
    const connection = connect<SiteMethods>({
      messenger: new WindowMessenger({
        remoteWindow: window.parent,
        allowedOrigins: [location.origin],
      }),
      channel,
      methods: { ...methods },
    })
    const ignore = () => {}
    connection.promise
      .then((site) => {
        const fail = params.get('fail')
        if (fail) return void site.failed(fail)
        setTimeout(
          () => void site.ready({ protocol: PROTOCOL }).catch(ignore),
          Number(params.get('delay') ?? 0),
        )
      })
      .catch(ignore)
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape')
        connection.promise.then((site) => site.escape()).catch(ignore)
    }
    // The connection lasts as long as the document, as the app's does.
    window.addEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!active || !focusPending.current) return
    focusPending.current = false
    box.current?.focus()
  }, [active, focusAsked])

  return (
    <main
      data-fixture
      data-active={active}
      data-focus-asked={focusAsked}
      inert={!active}
      className="flex h-svh flex-col bg-slate-raised p-8 text-paper"
    >
      <p className="wordmark text-3xl">Fixture app</p>
      <p className="mt-2 text-paper/70">
        A deterministic stand-in, not Theorem. {active ? 'Input is on.' : 'Input is off.'}
      </p>
      <textarea
        ref={box}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        aria-label="Message"
        className="mt-auto h-24 w-full rounded-lg bg-slate p-3 text-paper"
      />
    </main>
  )
}
