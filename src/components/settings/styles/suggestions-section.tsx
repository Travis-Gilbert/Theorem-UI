// SOURCING: coss ui Switch, Select and Alert, lib/theorem/response-styles useSuggestionsMutation, lib/theorem/credentials useCredentials (which provider's key is missing), @tanstack/react-router Link to the API keys page, the settings frame
import { Link } from '@tanstack/react-router'
import { Alert, AlertDescription, AlertTitle } from '@/components/coss/alert'
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/coss/select'
import { Switch } from '@/components/coss/switch'
import { SettingsSection } from '@/components/settings/settings-frame'
import { describeError } from '@/lib/theorem/client'
import { useCredentials } from '@/lib/theorem/credentials'
import { useSuggestionsMutation } from '@/lib/theorem/response-styles'
import type {
  StyleSuggestions,
  SuggestionState,
} from '@/lib/theorem/response-styles'
import { when } from './style-text'

const DEFAULT = '__default__'
const NONE = 'none'

const LAST: Readonly<Record<SuggestionState, string>> = {
  suggested: 'suggested',
  empty: 'nothing to suggest',
  skipped_no_model: 'skipped, no decision model',
  skipped_no_credential: 'skipped, no key',
  skipped_disabled: 'skipped, suggestions were off',
  unavailable: 'unavailable',
}

/** The state of the setting, in a sentence. */
function stateLine(
  suggestions: StyleSuggestions,
  modelName: string | undefined,
) {
  switch (suggestions.state) {
    case 'ready':
      return `Suggestions are on. ${modelName ?? 'The decision model'} offers hints before each answer.`
    case 'disabled':
      return 'Suggestions are off. Answers are written exactly as before.'
    case 'no_model':
      return 'Suggestions are on, but no decision model is set, so none are offered. Pick a model below.'
    case 'credential_missing':
      return 'Suggestions are on, but they are paused: the decision model cannot be reached.'
  }
}

/** How the latest turn's ask ended: "Last turn: unavailable (rate limited)". */
function lastLine(last: NonNullable<StyleSuggestions['last']>) {
  const code = last.code ? ` (${last.code.replaceAll('_', ' ')})` : ''
  return `Last turn: ${LAST[last.state]}${code}`
}

/**
 * Optional hints from a second, usually small, model. They never decide
 * anything: the main model reads them and may ignore them. Turning them off,
 * or choosing no decision model, changes nothing else.
 */
export function SuggestionsSection({
  suggestions,
}: {
  suggestions: StyleSuggestions
}) {
  const change = useSuggestionsMutation()
  const credentials = useCredentials()
  const { enabled, choice, models, model } = suggestions
  const known = models.find((candidate) => candidate.ref === model)
  const provider = model?.split('/')[0]
  const connection = credentials.data?.find(
    (credential) => credential.provider === provider,
  )
  // A pick that is not on the list still shows, so the control never lies about what is set.
  const extra =
    choice && choice !== NONE && !models.some((item) => item.ref === choice)
      ? [{ ref: choice, name: choice }]
      : []
  const labels: Record<string, string> = {
    [DEFAULT]:
      choice === null && known
        ? `Use the default (${known.name})`
        : choice === null && model
          ? `Use the default (${model})`
          : 'Use the default',
    ...Object.fromEntries(
      [...models, ...extra].map((item) => [item.ref, item.name]),
    ),
    [NONE]: 'None',
  }

  return (
    <SettingsSection
      title="Suggestions from a decision model"
      description="A second model reads each question and offers the main model optional hints about a framework, a tool or a delegation that might help. They are only hints: the main model decides whether to use them. Any model can be the decision model, and turning suggestions off, or choosing None, changes nothing else about your answers."
    >
      <label className="flex items-center gap-3 rounded-md border border-separator px-3 py-2.5">
        <Switch
          checked={enabled}
          disabled={change.isPending}
          onCheckedChange={(next) => change.mutate({ enabled: next })}
        />
        <span className="text-sm">Offer suggestions</span>
      </label>
      <div className="flex flex-col gap-1.5">
        <span id="decision-model-label" className="text-sm font-medium">
          Decision model
        </span>
        <Select
          items={Object.entries(labels).map(([value, label]) => ({
            value,
            label,
          }))}
          value={choice ?? DEFAULT}
          disabled={change.isPending}
          onValueChange={(next) =>
            change.mutate({ model: next === DEFAULT ? null : String(next) })
          }
        >
          <SelectTrigger aria-labelledby="decision-model-label">
            <SelectValue />
          </SelectTrigger>
          <SelectPopup>
            <SelectItem value={DEFAULT}>{labels[DEFAULT]}</SelectItem>
            {[...models, ...extra].map((item) => (
              <SelectItem key={item.ref} value={item.ref}>
                {item.name}
              </SelectItem>
            ))}
            <SelectItem value={NONE}>None</SelectItem>
          </SelectPopup>
        </Select>
        {models.length === 0 && (
          <p className="text-xs text-ink-muted">
            Theorem could not list decision models, so only the default and None
            are offered.
          </p>
        )}
      </div>
      <p role="status" className="text-sm text-ink-muted">
        {stateLine(suggestions, known?.name ?? model ?? undefined)}
      </p>
      {suggestions.state === 'credential_missing' && (
        <Alert variant="warning">
          <AlertTitle>The decision model has no key</AlertTitle>
          <AlertDescription>
            <p>
              {connection
                ? `The ${connection.name} connection has no key, so the decision model cannot be reached.`
                : 'The connection the decision model uses has no key, so it cannot be reached.'}{' '}
              Add one under{' '}
              <Link to="/settings/keys" className="underline">
                API keys
              </Link>
              , or pick a different decision model.
            </p>
          </AlertDescription>
        </Alert>
      )}
      <p className="text-sm text-ink-muted">
        {suggestions.last ? (
          <>
            {lastLine(suggestions.last)}{' '}
            <span className="text-ink-faint">
              {when(suggestions.last.atMs)}
            </span>
          </>
        ) : (
          'No turn has asked for suggestions yet.'
        )}
      </p>
      {change.error && (
        <p role="alert" className="text-sm text-error-ink">
          {describeError(change.error)}
        </p>
      )}
    </SettingsSection>
  )
}
