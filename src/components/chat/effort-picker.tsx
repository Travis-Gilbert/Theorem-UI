// SOURCING: coss ui Menu over Base UI Menu (MenuRadioGroup / MenuRadioItem for the one choice), ui/tooltip over Base UI Tooltip, lib/theorem/models (the catalog's effort levels, the picked model, the per-model effort store the send reads)
import { useEffect, useMemo } from 'react'
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
import { useModelCatalog, useModelEffort, usePickedModels } from '@/lib/theorem/models'
import type { ModelOption } from '@/lib/theorem/models'

/** The radio value of "no level": the model runs at its own default. */
const DEFAULT = ''

const LABELS: Readonly<Record<string, string>> = {
  minimal: 'Minimal',
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  xhigh: 'Extra high',
  max: 'Max',
}

export const effortLabel = (level: string) =>
  LABELS[level] ?? level.charAt(0).toUpperCase() + level.slice(1)

/**
 * The model the next turn runs on, as the catalog lists it: the picked one,
 * or Theorem's default when nothing is picked. Undefined until the catalog
 * says.
 */
export function useEffectiveModel(): { key: string; model: ModelOption | undefined } {
  const { data: catalog, list } = useModelCatalog()
  const selected = usePickedModels((s) => s.selected)
  const ref = selected ?? list?.defaultRef
  const model = useMemo(
    () => (ref ? catalog?.find((option) => option.ref === ref) : undefined),
    [catalog, ref],
  )
  return { key: selected ?? '', model }
}

/**
 * The composer's reasoning effort menu, beside the model picker. It lists the
 * levels Theorem says the model's route sends and is absent for a model that
 * takes none. A level stays chosen per model; a stored level the model no
 * longer lists is dropped, so a send never carries one Theorem would refuse.
 */
export function EffortPicker() {
  const { key, model } = useEffectiveModel()
  const levels = model?.effortLevels ?? []
  const chosen = useModelEffort((s) => s.byModel[key])
  const choose = useModelEffort((s) => s.choose)

  useEffect(() => {
    if (model && chosen && !model.effortLevels.includes(chosen)) choose(key, undefined)
  }, [model, chosen, key, choose])

  if (!levels.length) return null
  const current = chosen && levels.includes(chosen) ? chosen : DEFAULT
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
            <span>{current ? effortLabel(current) : 'Effort'}</span>
            <Icon.UpDown className="size-3.5 shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="top">How hard the model thinks before it answers</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <MenuPopup side="top" align="end" className="w-52">
        <MenuGroup>
          <MenuGroupLabel>Reasoning effort</MenuGroupLabel>
          <MenuRadioGroup
            value={current}
            onValueChange={(value: string) => choose(key, value || undefined)}
          >
            <MenuRadioItem value={DEFAULT}>
              <span className="flex items-baseline justify-between gap-3">
                Default
                {model?.effortDefault && (
                  <span className="text-xs text-ink-faint">
                    {effortLabel(model.effortDefault)}
                  </span>
                )}
              </span>
            </MenuRadioItem>
            {levels.map((level) => (
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
