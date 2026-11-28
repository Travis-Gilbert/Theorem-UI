// SOURCING: lib/objects/migration (preview every object under the new definition, apply with the stale check and the undo); @tanstack/react-query useMutation for both steps; ui/button and ui/input. The layout follows the class editor's own notice block above it.
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import type { ObjectType, ObjectTypeInput } from '@/components/records/contract'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { applyMigration, planMigration } from '@/lib/objects/migration'
import type { MigrationPlan } from '@/lib/objects/migration'

/** Convert a class's existing objects to a changed definition, previewed first. */
export function ClassMigration({
  base,
  input,
  onApplied,
}: {
  base: ObjectType
  input: ObjectTypeInput
  onApplied: (declared: ObjectType) => void
}) {
  const client = useQueryClient()
  const [fills, setFills] = useState<Record<string, string>>({})
  const [plan, setPlan] = useState<MigrationPlan>()
  const preview = useMutation({
    mutationFn: () => planMigration(base, input, fills),
    onSuccess: setPlan,
  })
  const apply = useMutation({
    mutationFn: (current: MigrationPlan) => applyMigration(current),
    onSettled: () =>
      void client.invalidateQueries({ queryKey: ['theorem', 'records'] }),
    onSuccess: (declared) => {
      setPlan(undefined)
      onApplied(declared)
    },
  })
  // A plan is for the definition it was made from.
  const current =
    plan && JSON.stringify(plan.after) === JSON.stringify(input)
      ? plan
      : undefined
  const required = input.fields.filter(
    (f) =>
      f.required &&
      !base.fields.find((old) => old.key === f.key && old.required),
  )
  const changing = current?.rows.filter((r) => Object.keys(r.patch).length)
  const failing = current?.rows.filter((r) => r.failures.length) ?? []
  return (
    <section
      aria-label="Migration"
      className="flex flex-col gap-3 rounded-lg border border-separator p-3 text-sm"
    >
      {required.map((field) => (
        <label key={field.key} className="flex flex-col gap-1">
          <span className="text-xs font-medium text-ink-muted">
            {field.label} for objects without one
          </span>
          <Input
            aria-label={`${field.label} for objects without one`}
            value={fills[field.key] ?? ''}
            onChange={(event) =>
              setFills({ ...fills, [field.key]: event.target.value })
            }
          />
        </label>
      ))}
      {current && (
        <div role="status" className="flex flex-col gap-1">
          <p>
            {changing!.length} of {current.rows.length}{' '}
            {base.label_plural.toLowerCase()} change
            {failing.length ? `, ${failing.length} cannot` : ''}.
          </p>
          {failing.length > 0 && (
            <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto text-error-ink">
              {failing.map((row) => (
                <li key={row.id} className="wrap-anywhere">
                  {row.title}:{' '}
                  {row.failures.map((f) => `${f.label} ${f.reason}`).join('; ')}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(preview.error ?? apply.error) && (
        <p role="alert" className="wrap-anywhere text-error-ink">
          {(preview.error ?? apply.error)!.message}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant={current ? 'ghost' : 'default'}
          disabled={preview.isPending || apply.isPending}
          onClick={() => preview.mutate()}
        >
          {preview.isPending
            ? 'Reading…'
            : current
              ? 'Preview again'
              : 'Preview migration'}
        </Button>
        {current && !failing.length && (
          <Button
            size="sm"
            disabled={apply.isPending}
            onClick={() => apply.mutate(current)}
          >
            {apply.isPending
              ? 'Migrating…'
              : `Migrate ${changing!.length} and save`}
          </Button>
        )}
      </div>
    </section>
  )
}
