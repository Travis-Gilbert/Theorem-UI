// SOURCING: the app's Input and Button. The element a person pointed at in a
// running App, with what its source writes as plain text offered for change.
// Anything else about it is the agent's to change, with the selection.
import { useMemo, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { editElement, parsePlace, readElement } from '@/lib/blocks/app-edit'
import type { ElementEdit } from '@/lib/blocks/app-edit'
import { appSourcesOf } from '@/lib/blocks/app-source'

/** The element's own text, among its attributes. */
const TEXT = 'Text'

/**
 * The element at `stamp` in the App's source. `onApply` is given the file
 * with the element's changes made; it saves that as the App's next revision.
 */
export function AppElement({
  html,
  stamp,
  onApply,
}: {
  html: string
  /** Where the element was written, `Header.tsx:7:7`. */
  stamp: string
  onApply: (file: string, source: string) => Promise<void> | void
}) {
  const found = useMemo(() => {
    const place = parsePlace(stamp)
    if (!place) return undefined
    let source: string | undefined
    try {
      source = appSourcesOf(html)?.files[place.file]
    } catch {
      return undefined
    }
    if (source === undefined) return undefined
    const element = readElement(source, place)
    return element ? { place, source, element } : undefined
  }, [html, stamp])
  // What the person has typed, by field; a field not in it is as written.
  const [typed, setTyped] = useState<{
    stamp: string
    values: Record<string, string>
  }>({ stamp, values: {} })
  const [error, setError] = useState<string>()
  if (!found) return null
  const { place, source, element } = found
  const values = typed.stamp === stamp ? typed.values : {}
  const fields = [
    ...(element.text ? [{ name: TEXT, written: element.text.value }] : []),
    ...element.attributes.map(({ name, value }) => ({ name, written: value })),
  ]
  const edits: Array<ElementEdit> = fields
    .filter(({ name, written }) => (values[name] ?? written) !== written)
    .map(({ name }) =>
      name === TEXT
        ? { kind: 'text', value: values[name]! }
        : { kind: 'attribute', name, value: values[name]! },
    )
  const where = `${place.file}:${place.line}`
  return (
    <section
      aria-label="Element"
      data-slot="app-element"
      className="flex flex-col gap-2 text-xs"
    >
      <div className="flex flex-wrap items-baseline gap-2 text-ink-muted">
        <span className="font-mono text-ink">{`<${element.tag}>`}</span>
        <span className="font-mono">{where}</span>
        {!fields.length && (
          <span>
            Nothing here is written as plain text. Ask about the selection to
            change it.
          </span>
        )}
      </div>
      {fields.length > 0 && (
        <form
          className="flex flex-col gap-1.5"
          onSubmit={(event) => {
            event.preventDefault()
            if (!edits.length) return
            setError(undefined)
            try {
              void onApply(place.file, editElement(source, place, edits))
            } catch (failure) {
              setError(
                failure instanceof Error ? failure.message : String(failure),
              )
            }
          }}
        >
          {fields.map(({ name, written }) => (
            <label key={name} className="flex items-center gap-2">
              <span className="w-24 shrink-0 text-ink-muted">{name}</span>
              <Input
                name={name}
                value={values[name] ?? written}
                onChange={(event) =>
                  setTyped({
                    stamp,
                    values: { ...values, [name]: event.target.value },
                  })
                }
              />
            </label>
          ))}
          <div className="flex items-center gap-2">
            <Button size="xs" type="submit" disabled={!edits.length}>
              Apply to source
            </Button>
            {error && (
              <span role="alert" className="text-error-ink">
                {error}
              </span>
            )}
          </div>
        </form>
      )}
    </section>
  )
}
