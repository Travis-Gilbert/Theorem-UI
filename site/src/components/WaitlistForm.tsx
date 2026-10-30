import { useId, useState } from 'react'
import type { FormEvent } from 'react'

type State =
  | { kind: 'idle' }
  | { kind: 'sending' }
  | { kind: 'done'; already: boolean }
  | { kind: 'error'; message: string }

const messages: Record<string, string> = {
  invalid_email: 'That doesn’t look like an email address.',
  waitlist_unavailable:
    'The waitlist is offline for a moment. Try again shortly.',
}

export function WaitlistForm({
  source,
  tone = 'paper',
}: {
  source: string
  tone?: 'paper' | 'clay'
}) {
  const id = useId()
  const [state, setState] = useState<State>({ kind: 'idle' })

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setState({ kind: 'sending' })
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: form.get('email'),
          company: form.get('company'),
          source,
        }),
      })
      const body = (await response.json().catch(() => ({}))) as {
        status?: string
        error?: string
      }
      if (response.ok) {
        setState({ kind: 'done', already: body.status === 'already_joined' })
      } else {
        setState({
          kind: 'error',
          message:
            messages[body.error ?? ''] ?? 'Something went wrong. Try again.',
        })
      }
    } catch {
      setState({
        kind: 'error',
        message: 'Couldn’t reach the waitlist. Check your connection.',
      })
    }
  }

  const clay = tone === 'clay'

  if (state.kind === 'done') {
    return (
      <p
        role="status"
        className={`flex items-center gap-3 border px-4 py-3 font-mono text-[12px] tracking-[0.06em] uppercase ${
          clay ? 'border-paper/40 text-paper' : 'border-line-strong text-ink'
        }`}
      >
        <span
          aria-hidden
          className={`size-2.5 ${clay ? 'bg-paper' : 'bg-agent'}`}
        />
        {state.already
          ? 'You’re already on the list.'
          : 'You’re on the list. ∎'}
      </p>
    )
  }

  return (
    <form onSubmit={submit} className="w-full">
      <div
        className={`flex border ${
          clay
            ? 'border-paper/50 bg-paper/10'
            : 'border-line-strong bg-paper-raised'
        } focus-within:outline-2 focus-within:outline-offset-2 ${
          clay ? 'focus-within:outline-paper' : 'focus-within:outline-human'
        }`}
      >
        <label htmlFor={`${id}-email`} className="sr-only">
          Email address
        </label>
        <input
          id={`${id}-email`}
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@domain.com"
          className={`min-w-0 flex-1 bg-transparent px-4 py-3 text-[15px] outline-none ${
            clay
              ? 'text-paper placeholder:text-paper/60'
              : 'text-ink placeholder:text-ink-faint'
          }`}
        />
        {/* Honeypot, hidden from people and assistive technology. */}
        <input
          name="company"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          aria-hidden
          className="absolute -left-[9999px] h-px w-px opacity-0"
        />
        <button
          type="submit"
          disabled={state.kind === 'sending'}
          className={`group flex shrink-0 items-center gap-3 px-4 font-mono text-[12px] tracking-[0.08em] uppercase transition-colors disabled:opacity-60 ${
            clay
              ? 'bg-paper text-human-deep hover:bg-paper-raised'
              : 'bg-ink text-paper hover:bg-human'
          }`}
        >
          {state.kind === 'sending' ? 'Joining…' : 'Join waitlist'}
          <span
            aria-hidden
            className="transition-transform group-hover:translate-x-0.5"
          >
            →
          </span>
        </button>
      </div>
      <p
        role={state.kind === 'error' ? 'alert' : undefined}
        className={`mt-2 min-h-[1.25rem] font-mono text-[11px] tracking-[0.04em] ${
          state.kind === 'error'
            ? clay
              ? 'text-paper'
              : 'text-human-deep'
            : clay
              ? 'text-paper/70'
              : 'text-ink-faint'
        }`}
      >
        {state.kind === 'error'
          ? state.message
          : 'Early access, invites in waves.'}
      </p>
    </form>
  )
}
