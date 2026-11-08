// SOURCING: textmode.js, through mount-field.ts; this is only the React lifecycle around that mount
import { useEffect, useRef, useState } from 'react'
import { cn } from '@/lib/utils'
import { mountField, pulseAll } from './mount-field'
import type { FieldHandle } from './mount-field'

export interface FieldProps {
  className?: string
  /** Pins the starting field and every random choice, for a story. Left out, each load starts a new field. */
  seed?: number
  /** Held, the field shows a settled frame and spends nothing. Reduced motion starts held. */
  running?: boolean
}

/** The living paper: Conway's Life in viewport space, behind the scene. It does not move with the camera. */
export function Field({
  className,
  seed: pinned,
  running = true,
}: FieldProps) {
  const [fresh] = useState(() => Math.floor(Math.random() * 2 ** 32))
  const seed = pinned ?? fresh
  const host = useRef<HTMLDivElement>(null)
  const field = useRef<FieldHandle | null>(null)
  const wanted = useRef(running)
  wanted.current = running
  useEffect(() => {
    if (!host.current) return
    const mounted = mountField(host.current, { seed, running: wanted.current })
    field.current = mounted
    return () => {
      field.current = null
      mounted.destroy()
    }
  }, [seed])
  useEffect(() => {
    field.current?.setRunning(running)
  }, [running])
  return (
    <div
      ref={host}
      aria-hidden
      className={cn('pointer-events-none fixed inset-0 z-0', className)}
    />
  )
}

/** Wakes the field for a moment: the visitor joined. 0 to 1. */
export function pulseField(strength = 0.5) {
  pulseAll(strength)
}
