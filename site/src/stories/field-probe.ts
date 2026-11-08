// SOURCING: hand-rolled. The field's own measurements, reachable from a check through window.__field.
import { useEffect } from 'react'
import { aliveNear, measureField, painted } from '@/field/mount-field'
import type { FieldMetrics } from '@/field/mount-field'

declare global {
  interface Window {
    __field?: {
      measure: (ms: number) => Promise<FieldMetrics>
      aliveNear: (x: number, y: number, radius?: number) => number[]
      painted: () => number
    }
  }
}

export function useFieldProbe() {
  useEffect(() => {
    window.__field = { aliveNear, painted, measure: measureField }
    return () => void delete window.__field
  }, [])
}
