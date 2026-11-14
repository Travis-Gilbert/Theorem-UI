// SOURCING: coss ui SegmentedControl and NumberField over Base UI, lib/theorem/generation (the fields they edit); one pair of controls for the settings page and the composer, whose fields are the same
import {
  NumberField,
  NumberFieldGroup,
  NumberFieldInput,
} from '@/components/coss/number-field'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/coss/segmented-control'
import { RESPONSE_DETAILS } from '@/lib/theorem/generation'
import type { ResponseDetail } from '@/lib/theorem/generation'

const DETAIL_OPTIONS: { value: ResponseDetail | undefined; label: string }[] = [
  { value: undefined, label: 'Default' },
  ...RESPONSE_DETAILS.map((value) => ({
    value,
    label: value.charAt(0).toUpperCase() + value.slice(1),
  })),
]

/** How much a reply says: concise, balanced or thorough, or left to Theorem. */
export function DetailControl({
  value,
  onChange,
}: {
  value: ResponseDetail | undefined
  onChange: (next: ResponseDetail | undefined) => void
}) {
  return (
    <SegmentedControl aria-label="Response detail" size="sm" className="max-w-full flex-wrap">
      {DETAIL_OPTIONS.map((option) => (
        <SegmentedControlItem
          key={option.label}
          size="sm"
          aria-pressed={value === option.value}
          data-pressed={value === option.value ? '' : undefined}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </SegmentedControlItem>
      ))}
    </SegmentedControl>
  )
}

/** A count of tokens or steps. Empty means no limit of the person's own; a cleared field unsets it. */
export function CountControl({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string
  value: number | undefined
  placeholder: string
  onChange: (next: number | undefined) => void
}) {
  return (
    <NumberField
      size="sm"
      min={1}
      step={100}
      format={{ maximumFractionDigits: 0 }}
      value={value ?? null}
      onValueCommitted={(next) => onChange(next === null ? undefined : Math.round(next))}
    >
      <NumberFieldGroup>
        <NumberFieldInput aria-label={label} placeholder={placeholder} className="text-start" />
      </NumberFieldGroup>
    </NumberField>
  )
}
