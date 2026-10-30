import { useId, useState } from 'react'
import type { FormEvent } from 'react'
import { ArrowRight, Check } from 'lucide-react'
import { Button } from '@/components/tailark/button'
import { cn } from '@/lib/utils'

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
  tone = 'light',
  className,
}: {
  source: string
  tone?: 'light' | 'ember'
  className?: string
}) {
  const id = useId()
  const [state, setState] = useState<State>({ kind: 'idle' })
  const ember = tone === 'ember'

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
      if (response.ok)
        setState({ kind: 'done', already: body.status === 'already_joined' })
      else
        setState({
          kind: 'error',
          message:
            messages[body.error ?? ''] ?? 'Something went wrong. Try again.',
        })
    } catch {
      setState({
        kind: 'error',
        message: 'Couldn’t reach the waitlist. Check your connection.',
      })
    }
  }

  if (state.kind === 'done') {
    return (
      <p
        role="status"
        className={cn(
          'mx-auto flex w-fit items-center gap-2.5 rounded-full px-5 py-3 text-[15px] font-medium ring-1',
          ember
            ? 'bg-white/15 text-white ring-white/30'
            : 'bg-card text-foreground shadow-sm ring-foreground/10',
          className,
        )}
      >
        <Check
          className={cn('size-4', ember ? 'text-white' : 'text-primary')}
        />
        {state.already
          ? 'You’re already on the list.'
          : 'You’re on the list. We’ll be in touch.'}
      </p>
    )
  }

  return (
    <form onSubmit={submit} className={cn('w-full', className)}>
      <div
        className={cn(
          'relative flex items-center rounded-full p-1.5 pl-5 ring-1 transition-shadow focus-within:ring-2',
          ember
            ? 'bg-white/12 ring-white/30 backdrop-blur-sm focus-within:ring-white/70'
            : 'bg-card shadow-lg shadow-foreground/5 ring-foreground/10 focus-within:ring-primary/50',
        )}
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
          className={cn(
            'min-w-0 flex-1 bg-transparent py-2 text-[15px] outline-none',
            ember
              ? 'text-white placeholder:text-white/65'
              : 'placeholder:text-faint',
          )}
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
        <Button
          type="submit"
          disabled={state.kind === 'sending'}
          size="lg"
          className={cn(
            'h-10 shrink-0 px-5 text-[15px]',
            ember &&
              'bg-white text-[#9b3f17] hover:brightness-100 hover:bg-white/90',
          )}
        >
          {state.kind === 'sending' ? 'Joining…' : 'Join waitlist'}
          <ArrowRight className="opacity-60" />
        </Button>
      </div>
      <p
        role={state.kind === 'error' ? 'alert' : undefined}
        className={cn(
          'mt-2.5 min-h-5 text-center text-[13px]',
          state.kind === 'error'
            ? ember
              ? 'text-white'
              : 'text-primary'
            : ember
              ? 'text-white/75'
              : 'text-muted-foreground',
        )}
      >
        {state.kind === 'error'
          ? state.message
          : 'No spam. One email when your invite is ready.'}
      </p>
    </form>
  )
}
