// SOURCING: the settings frame (SettingsSection, SettingsBox, SettingsRow), coss ui Select over Base UI Select, components/chat/generation-fields (the controls the composer shares), lib/theorem/generation (the account defaults)
import { CountControl, DetailControl } from '@/components/chat/generation-fields'
import {
  Select,
  SelectItem,
  SelectPopup,
  SelectTrigger,
  SelectValue,
} from '@/components/coss/select'
import { SettingsBox, SettingsRow, SettingsSection } from '@/components/settings/settings-frame'
import { EFFORT_LEVELS, effortLabel, useGenerationDefaults } from '@/lib/theorem/generation'

/** The radio value of "no level": the model runs at its own default. */
const MODEL_DEFAULT = ''

const EFFORT_ITEMS = [
  { value: MODEL_DEFAULT, label: "Model's default" },
  ...EFFORT_LEVELS.map((value) => ({ value, label: effortLabel(value) })),
]

/**
 * How long and how deep a response may be, for every conversation that does
 * not set its own. They are saved with the account when this Theorem keeps
 * them, and on this browser when it does not.
 */
export function ResponsesSection() {
  const defaults = useGenerationDefaults((s) => s.defaults)
  const onServer = useGenerationDefaults((s) => s.onServer)
  const change = useGenerationDefaults((s) => s.change)
  return (
    <SettingsSection
      title="Responses"
      description={`How long and how deep a response may be. A conversation can set its own from the composer. ${
        onServer === false
          ? 'This Theorem does not keep them for the account yet, so they are saved on this browser.'
          : 'Saved with your account.'
      }`}
    >
      <SettingsBox>
        <SettingsRow title="Response detail" description="How much a reply says.">
          <DetailControl
            value={defaults.responseDetail}
            onChange={(responseDetail) => change({ responseDetail })}
          />
        </SettingsRow>
        <SettingsRow
          title="Reasoning effort"
          description="How hard the model thinks before it answers. A model that does not offer a level runs at the nearest it does."
        >
          <Select
            items={EFFORT_ITEMS}
            value={defaults.effort ?? MODEL_DEFAULT}
            onValueChange={(next) => {
              if (typeof next === 'string') change({ effort: next || undefined })
            }}
          >
            <SelectTrigger aria-label="Default reasoning effort" size="sm" className="w-40 min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectPopup>
              {EFFORT_ITEMS.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectPopup>
          </Select>
        </SettingsRow>
        <SettingsRow
          title="Maximum output per call"
          description="Tokens one model call may write. Empty uses the model's own maximum."
        >
          <div className="w-40">
            <CountControl
              label="Maximum output per call"
              value={defaults.maxOutputTokens}
              placeholder="Model's maximum"
              onChange={(maxOutputTokens) => change({ maxOutputTokens })}
            />
          </div>
        </SettingsRow>
        <SettingsRow
          title="Run budget: output tokens"
          description="Tokens a whole run may write across all its steps. Empty is no cap."
        >
          <div className="w-40">
            <CountControl
              label="Run budget output tokens"
              value={defaults.runBudget?.maxOutputTokens}
              placeholder="No cap"
              onChange={(maxOutputTokens) =>
                change({ runBudget: { ...defaults.runBudget, maxOutputTokens } })
              }
            />
          </div>
        </SettingsRow>
        <SettingsRow
          title="Run budget: steps"
          description="Steps a run may take before it stops and asks. Empty is no cap."
        >
          <div className="w-40">
            <CountControl
              label="Run budget steps"
              value={defaults.runBudget?.maxSteps}
              placeholder="No cap"
              onChange={(maxSteps) =>
                change({ runBudget: { ...defaults.runBudget, maxSteps } })
              }
            />
          </div>
        </SettingsRow>
      </SettingsBox>
    </SettingsSection>
  )
}
