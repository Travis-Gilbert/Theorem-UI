// SOURCING: coss ui RadioGroup, lib/theorem/response-styles useSelectionMutation (the account scope; null inherits) and resolveStyle (what inheriting resolves to), the settings frame
import { Radio, RadioGroup } from '@/components/coss/radio-group'
import { SettingsSection } from '@/components/settings/settings-frame'
import { describeError } from '@/lib/theorem/client'
import {
  resolveStyle,
  useSelectionMutation,
} from '@/lib/theorem/response-styles'
import type { ResponseStyleCatalog } from '@/lib/theorem/response-styles'

const INHERIT = '__inherit__'

/**
 * The account default. "Use Theorem's default" clears the choice, so the
 * account follows whatever Theorem's own default is; picking the style named
 * Default sets that style, which stays put if Theorem's default changes.
 */
export function DefaultsSection({
  catalog,
}: {
  catalog: ResponseStyleCatalog
}) {
  const select = useSelectionMutation()
  const { styles, selection } = catalog
  const builtin = resolveStyle(
    { account: null, project: null, conversation: null },
    styles,
  )
  const chosen = styles.find((style) => style.id === selection.account)

  return (
    <SettingsSection
      title="Where each style applies"
      description="Your default is used for every conversation that has no choice of its own."
    >
      <RadioGroup
        aria-label="Your default style"
        value={selection.account ?? INHERIT}
        disabled={select.isPending}
        onValueChange={(value) =>
          select.mutate({
            scope: 'account',
            style: value === INHERIT ? null : String(value),
          })
        }
      >
        <label className="flex items-start gap-2.5 rounded-md border border-separator px-3 py-2">
          <Radio
            value={INHERIT}
            aria-label="Use Theorem's default"
            className="mt-0.5"
          />
          <span className="flex min-w-0 flex-col">
            <span className="text-sm">
              Use Theorem&apos;s default ({builtin.name})
            </span>
            <span className="text-xs text-ink-muted">
              Follows whatever default Theorem ships, now and later. This is not
              the same as choosing the style named Default, which stays chosen
              whatever Theorem ships.
            </span>
          </span>
        </label>
        {styles.map((style) => (
          <label
            key={style.id}
            className="flex items-start gap-2.5 rounded-md border border-separator px-3 py-2"
          >
            <Radio
              value={style.id}
              aria-label={style.name}
              className="mt-0.5"
            />
            <span className="flex min-w-0 flex-col">
              <span className="text-sm">{style.name}</span>
              {style.description && (
                <span className="text-xs text-ink-muted">
                  {style.description}
                </span>
              )}
            </span>
          </label>
        ))}
      </RadioGroup>
      <p role="status" className="text-sm text-ink-muted">
        {chosen
          ? `Your default is ${chosen.name}.`
          : `You have not chosen a default, so new conversations use Theorem's default, ${builtin.name}.`}
      </p>
      {select.error && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(select.error)}
        </p>
      )}
      <p className="text-sm text-ink-muted">
        A project can have its own default, and a single conversation its own
        choice. Set them from the style menu in the composer: choose a style
        there, then Set as this project&apos;s default.
      </p>
    </SettingsSection>
  )
}
