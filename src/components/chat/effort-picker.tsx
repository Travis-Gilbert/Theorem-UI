// SOURCING: coss ui Menu over Base UI Menu (MenuRadioGroup / MenuRadioItem for the one choice), ui/tooltip over Base UI Tooltip, lib/theorem/models (the catalog's effort levels, the picked model), lib/theorem/generation (the effort a send carries, in the conversation's override over the account default)
import { useMemo } from 'react'
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuTrigger,
} from '@/components/coss/menu'
import { COMPOSER_TOOLTIP_DELAY } from '@/components/chat/composer-tools'
import { Icon } from '@/components/icons'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { effortLabel, useGenerationDefaults } from '@/lib/theorem/generation'
import { useModelCatalog, usePickedModels } from '@/lib/theorem/models'
import type { ModelOption } from '@/lib/theorem/models'
import { useConversationGeneration, useLatestRunFacts } from '@/lib/theorem/use-generation'

/** The radio value of "no level": the model runs at its own default. */
const DEFAULT = ''

/**
 * The model the next turn runs on, as the catalog lists it: the picked one,
 * or Theorem's default when nothing is picked. Undefined until the catalog
 * says.
 */
export function useEffectiveModel(): { model: ModelOption | undefined } {
  const { data: catalog, list } = useModelCatalog()
  const selected = usePickedModels((s) => s.selected)
  const ref = selected ?? list?.defaultRef
  const model = useMemo(
    () => (ref ? catalog?.find((option) => option.ref === ref) : undefined),
    [catalog, ref],
  )
  return { model }
}

/**
 * The composer's reasoning effort menu, beside the model picker. It lists the
 * levels Theorem says the model's route sends and is absent for a model that
 * takes none. The level is the conversation's, over the account's default; it
 * goes out whatever the model, and Theorem maps one the model does not list.
 * When the last run was mapped, the menu names the level it ran at.
 */
export function EffortPicker() {
  const { model } = useEffectiveModel()
  const { override, change } = useConversationGeneration()
  const accountEffort = useGenerationDefaults((s) => s.defaults.effort)
  const mapped = useLatestRunFacts()?.limits?.effort
  const levels = model?.effortLevels ?? []
  if (!levels.length) return null
  const chosen = override.effort ?? DEFAULT
  const requested = override.effort ?? accountEffort
  const ranAt = mapped?.requested === requested ? mapped?.effective : undefined
  const shown = ranAt ?? requested
  const standing = accountEffort ?? model?.effortDefault
  // A level kept from another model stays in the list so the choice shows.
  const listed = chosen && !levels.includes(chosen) ? [...levels, chosen] : levels
  return (
    <Menu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            delay={COMPOSER_TOOLTIP_DELAY}
            render={
              <MenuTrigger
                aria-label="Reasoning effort"
                className="flex h-8 items-center gap-1 rounded-md px-2 text-sm text-ink-muted transition-colors duration-100 outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-popup-open:bg-hover data-popup-open:text-ink"
              />
            }
          >
            <span>{shown ? effortLabel(shown) : 'Effort'}</span>
            <Icon.UpDown className="size-3.5 shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="top">
            {ranAt && requested && ranAt !== requested
              ? `${effortLabel(requested)} is not offered here; the last reply ran at ${effortLabel(ranAt)}`
              : 'How hard the model thinks before it answers'}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <MenuPopup side="top" align="end" className="w-52">
        <MenuGroup>
          <MenuGroupLabel>Reasoning effort</MenuGroupLabel>
          <MenuRadioGroup
            value={chosen}
            onValueChange={(value: string) => change({ effort: value || undefined })}
          >
            <MenuRadioItem value={DEFAULT}>
              <span className="flex items-baseline justify-between gap-3">
                Default
                {standing && (
                  <span className="text-xs text-ink-faint">{effortLabel(standing)}</span>
                )}
              </span>
            </MenuRadioItem>
            {listed.map((level) => (
              <MenuRadioItem key={level} value={level}>
                {effortLabel(level)}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
      </MenuPopup>
    </Menu>
  )
}
