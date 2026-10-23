// SOURCING: hand-roll — Obsidian's property list (a note's frontmatter as
// typed fields: text, list, number, checkbox, date) over the app's Input and
// Button. No library edits YAML frontmatter as fields; yaml's Document API
// (frontmatter.ts) writes each change back keeping the rest as written.
import { Icon } from '@/components/icons'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type Change = (key: string, value: unknown) => void

const DATE = /^\d{4}-\d{2}-\d{2}$/

/** A text field that commits on Enter or blur, not on every keystroke. */
function CommitInput({
  value,
  onCommit,
  ...props
}: Omit<React.ComponentProps<typeof Input>, 'value' | 'defaultValue'> & {
  value: string
  onCommit: (value: string) => void
}) {
  return (
    <Input
      // A new value from the file replaces what was typed.
      key={value}
      defaultValue={value}
      onBlur={(event) => {
        if (event.target.value !== value) onCommit(event.target.value)
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur()
      }}
      {...props}
    />
  )
}

function PropertyValue({
  name,
  value,
  onChange,
}: {
  name: string
  value: unknown
  onChange: (value: unknown) => void
}) {
  const label = `${name} value`
  if (typeof value === 'boolean')
    return (
      <input
        type="checkbox"
        aria-label={label}
        checked={value}
        onChange={(event) => onChange(event.target.checked)}
        className="size-4 accent-redwood"
      />
    )
  if (typeof value === 'number')
    return (
      <CommitInput
        type="number"
        aria-label={label}
        value={String(value)}
        onCommit={(next) => onChange(next === '' ? null : Number(next))}
        className="h-7"
      />
    )
  if (Array.isArray(value) && value.every((v) => typeof v !== 'object'))
    return (
      <CommitInput
        aria-label={label}
        value={value.join(', ')}
        placeholder="Comma-separated"
        onCommit={(next) =>
          onChange(
            next
              .split(',')
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
        className="h-7"
      />
    )
  if (value instanceof Date || (typeof value === 'string' && DATE.test(value)))
    return (
      <CommitInput
        type="date"
        aria-label={label}
        value={value instanceof Date ? value.toISOString().slice(0, 10) : value}
        onCommit={(next) => onChange(next || null)}
        className="h-7"
      />
    )
  if (value === null || typeof value === 'string')
    return (
      <CommitInput
        aria-label={label}
        value={value ?? ''}
        placeholder="Empty"
        onCommit={(next) => onChange(next || null)}
        className="h-7"
      />
    )
  return (
    <code className="block truncate py-1 text-xs text-ink-muted" title="Edit this property in the file's source">
      {JSON.stringify(value)}
    </code>
  )
}

/**
 * A note's properties. `onChange` sets one, or removes it when the value is
 * undefined. Null properties are the frontmatter being something other than
 * a map, which only its source can fix.
 */
export function PropertiesEditor({
  properties,
  onChange,
}: {
  properties: Record<string, unknown> | null
  onChange: Change
}) {
  if (properties === null)
    return (
      <p className="px-12 pt-4 text-xs text-ink-faint">
        This note’s frontmatter is not a list of properties, so it is left as
        written.
      </p>
    )
  const entries = Object.entries(properties)
  return (
    <section aria-label="Properties" className="px-12 pt-5">
      {entries.length > 0 && (
        <dl className="grid grid-cols-[minmax(6rem,10rem)_1fr_auto] items-center gap-x-2 gap-y-1 text-sm">
          {entries.map(([key, value]) => (
            <div key={key} className="contents">
              <dt className="truncate text-ink-muted" title={key}>
                {key}
              </dt>
              <dd className="min-w-0">
                <PropertyValue
                  name={key}
                  value={value}
                  onChange={(next) => onChange(key, next)}
                />
              </dd>
              <dd>
                <Button
                  size="icon-xs"
                  variant="ghost"
                  aria-label={`Remove ${key}`}
                  onClick={() => onChange(key, undefined)}
                >
                  <Icon.Close />
                </Button>
              </dd>
            </div>
          ))}
        </dl>
      )}
      <CommitInput
        aria-label="Add a property"
        value=""
        placeholder="Add a property"
        onCommit={(name) => {
          const key = name.trim()
          if (key && !(key in properties)) onChange(key, null)
        }}
        className="mt-1 h-7 max-w-48 border-transparent text-ink-faint hover:border-input"
      />
    </section>
  )
}
