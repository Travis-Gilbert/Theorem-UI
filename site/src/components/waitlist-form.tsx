// SOURCING: coss ui Input and Button (Base UI underneath), animejs 4 through lib/motion.ts for the press; the form is a native <form> posting to the worker, and its state machine is ours since nothing upstream knows the worker's answers.
import { useRef, useState } from 'react'
import type { FormEvent } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { join } from '@/content'
import { pulseField } from '@/field'
import { press } from '@/lib/motion'

export type WaitlistState =
  'idle' | 'focused' | 'sending' | 'joined' | 'already' | 'invalid' | 'failed'

export interface WaitlistFormProps {
  /** Recorded with the signup so we know which form it came from. */
  source: string
  className?: string
  /** Forces one state and ignores input. For stories. */
  forceState?: WaitlistState
}

const follow = join.form

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const sampleEmail: Partial<Record<WaitlistState, string>> = {
  sending: 'you@example.com',
  failed: 'you@example.com',
  invalid: 'you@example',
}

/**
 * State machine. `status` holds what the network decided; `focused` is the
 * field's focus. idle and focused are the same status, told apart by focus.
 * submit: invalid email -> invalid (no request); else sending -> joined |
 * already | invalid (server said so) | failed. Typing again leaves invalid
 * and failed for idle. joined and already replace the form in place.
 */
export function WaitlistForm({
  source,
  className = '',
  forceState,
}: WaitlistFormProps) {
  const [status, setStatus] =
    useState<Exclude<WaitlistState, 'focused'>>('idle')
  const [focused, setFocused] = useState(false)
  const [email, setEmail] = useState(
    forceState ? (sampleEmail[forceState] ?? '') : '',
  )
  const button = useRef<HTMLButtonElement>(null)

  const state: WaitlistState =
    forceState ?? (status === 'idle' && focused ? 'focused' : status)
  const done = state === 'joined' || state === 'already'
  const sending = state === 'sending'
  const problem =
    state === 'invalid'
      ? follow.invalid
      : state === 'failed'
        ? follow.failed
        : ''
  const message =
    state === 'joined'
      ? follow.joined
      : state === 'already'
        ? follow.alreadyJoined
        : problem

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (forceState || sending) return
    const form = new FormData(event.currentTarget)
    if (!EMAIL.test(email.trim())) return setStatus('invalid')
    setStatus('sending')
    try {
      const response = await fetch('/api/waitlist', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source,
          company: form.get('company') ?? '',
        }),
      })
      const body: { status?: string; error?: string } = await response
        .json()
        .catch(() => ({}))
      if (body.status === 'joined') {
        setStatus('joined')
        pulseField(1)
      } else if (body.status === 'already_joined') setStatus('already')
      else if (body.error === 'invalid_email') setStatus('invalid')
      else setStatus('failed')
    } catch {
      setStatus('failed')
    }
  }

  const give = (down: boolean) => {
    if (!sending) press(button.current, down)
  }

  return (
    <div className={className}>
      {!done && (
        <form action="/api/waitlist" method="post" noValidate onSubmit={submit}>
          <input type="hidden" name="source" value={source} />
          <div
            aria-hidden
            className="absolute -left-[9999px] h-0 w-0 overflow-hidden"
          >
            <input
              name="company"
              tabIndex={-1}
              autoComplete="off"
              defaultValue=""
            />
          </div>
          {/* One row from the small breakpoint up; on a phone the button drops under the field so the address has the full width. */}
          <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
            <label htmlFor={`email-${source}`} className="sr-only">
              {follow.emailLabel}
            </label>
            <Input
              id={`email-${source}`}
              name="email"
              type="email"
              inputMode="email"
              autoComplete="email"
              size="lg"
              required
              value={email}
              readOnly={!!forceState}
              disabled={sending}
              aria-invalid={state === 'invalid' || undefined}
              placeholder={follow.emailPlaceholder}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              onChange={(e) => {
                setEmail(e.target.value)
                if (status === 'invalid' || status === 'failed')
                  setStatus('idle')
              }}
              className="min-w-0 flex-1"
            />
            <Button
              ref={button}
              type="submit"
              size="lg"
              loading={sending}
              onPointerDown={() => give(true)}
              onPointerUp={() => give(false)}
              onPointerLeave={() => give(false)}
              className="brass-action"
            >
              {sending ? follow.sending : follow.cta}
            </Button>
          </div>
          {!problem && (
            <p className="mt-2 text-sm text-muted-ink">{follow.finePrint}</p>
          )}
        </form>
      )}
      <div aria-live="polite">
        {message && (
          <p
            className={
              done
                ? 'text-xl font-semibold text-slate'
                : 'mt-2 text-sm text-destructive-foreground'
            }
          >
            {message}
          </p>
        )}
      </div>
    </div>
  )
}
