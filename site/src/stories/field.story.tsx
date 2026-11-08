// SOURCING: hand-rolled. A story is a plain render of Field alone; nothing upstream models it. `?seed=`, `?held`; `window.__field` runs the motion and pointer checks.
import { Field } from '@/field'
import { useFieldProbe } from './field-probe'

export default function FieldStory() {
  const params = new URLSearchParams(location.search)
  const seed = Number(params.get('seed') ?? 20261106)
  useFieldProbe()
  return (
    <div className="bg-paper h-screen w-screen">
      <Field
        seed={Number.isFinite(seed) ? seed : 20261106}
        running={!params.has('held')}
      />
    </div>
  )
}
