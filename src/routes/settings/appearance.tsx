// SOURCING: next-themes (light/dark), lib/palette (colours), lib/surfaces (what the composer is made of), lib/life/store (the field behind the chat), lib/figures (Kit and Theo), components/face/face-feel (how Theo moves), coss ui SegmentedControl, the settings frame
import { createFileRoute } from '@tanstack/react-router'
import { useTheme } from 'next-themes'
import {
  SegmentedControl,
  SegmentedControlItem,
} from '@/components/coss/segmented-control'
import { Icon } from '@/components/icons'
import {
  SettingsBox,
  SettingsPage,
  SettingsRow,
  SettingsSection,
} from '@/components/settings/settings-frame'
import { FaceFeel } from '@/components/face/face-feel'
import { FaceMark } from '@/components/face/face-mark'
import { VISORS, useFigures } from '@/lib/figures'
import { useLifeControls } from '@/lib/life/store'
import { PALETTES, usePalette } from '@/lib/palette'
import { COMPOSER_SURFACES, useSurfaces } from '@/lib/surfaces'

export const Route = createFileRoute('/settings/appearance')({
  component: Appearance,
})

const THEMES = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
]

/** One choice of a segmented control; the control slides its indicator to the pressed item. */
function Choice({
  pressed,
  onPress,
  label,
}: {
  pressed: boolean
  onPress: () => void
  label: string
}) {
  return (
    <SegmentedControlItem
      size="sm"
      aria-pressed={pressed}
      data-pressed={pressed ? '' : undefined}
      onClick={onPress}
    >
      {label}
    </SegmentedControlItem>
  )
}

function Appearance() {
  const { theme, setTheme } = useTheme()
  const { palette, setPalette } = usePalette()
  const lifeShown = useLifeControls((state) => state.shown)
  const composer = useSurfaces((state) => state.composer)
  const setComposer = useSurfaces((state) => state.setComposer)
  const figures = useFigures()
  return (
    <SettingsPage
      title="Appearance"
      description="How Theorem looks on this device."
    >
      <SettingsSection title="Display">
        <SettingsBox>
          <SettingsRow
            Mark={Icon.Sun}
            title="Theme"
            description="Light, dark, or whatever the system uses."
          >
            <SegmentedControl size="sm" aria-label="Theme">
              {THEMES.map(({ value, label }) => (
                <Choice
                  key={value}
                  label={label}
                  pressed={theme === value}
                  onPress={() => setTheme(value)}
                />
              ))}
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={Icon.Layout}
            title="Colors"
            description="The palette for both themes."
          >
            <SegmentedControl size="sm" aria-label="Colors">
              {PALETTES.map(({ value, label }) => (
                <Choice
                  key={value}
                  label={label}
                  pressed={palette === value}
                  onPress={() => setPalette(value)}
                />
              ))}
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={Icon.Edit}
            title="Composer"
            description="What the message box is made of. Paper is a smooth sheet with a fine grain; frosted glass lets the Life field and the conversation show through it, blurred."
          >
            <SegmentedControl size="sm" aria-label="Composer">
              {COMPOSER_SURFACES.map(({ value, label }) => (
                <Choice
                  key={value}
                  label={label}
                  pressed={composer === value}
                  onPress={() => setComposer(value)}
                />
              ))}
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={Icon.Grip}
            title="Life field"
            description="A Game of Life behind the chat that quickens as the model works. Right-click empty space for its controls."
          >
            <SegmentedControl size="sm" aria-label="Life field">
              <Choice
                label="On"
                pressed={lifeShown}
                onPress={() => useLifeControls.setState({ shown: true })}
              />
              <Choice
                label="Off"
                pressed={!lifeShown}
                onPress={() => useLifeControls.setState({ shown: false })}
              />
            </SegmentedControl>
          </SettingsRow>
        </SettingsBox>
      </SettingsSection>
      <SettingsSection title="Figures">
        <SettingsBox>
          <SettingsRow
            Mark={FaceMark}
            title="Theo"
            description="The agent’s face. It shows what Theorem is doing, reacts to you, and sleeps when nothing is happening. Tap it, carry it, or double-tap to send it home."
          >
            <SegmentedControl size="sm" aria-label="Theo">
              <Choice
                label="On"
                pressed={figures.theo}
                onPress={() => figures.setTheo(true)}
              />
              <Choice
                label="Off"
                pressed={!figures.theo}
                onPress={() => figures.setTheo(false)}
              />
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={FaceMark}
            title="Theo’s visor"
            description="The dark screen behind Theo’s eyes. Auto keeps it in the light theme and drops it in the dark one, where the eyes glow against the page. Without it in the light theme, the eyes are drawn dark."
          >
            <SegmentedControl size="sm" aria-label="Theo’s visor">
              {VISORS.map(({ value, label }) => (
                <Choice
                  key={value}
                  label={label}
                  pressed={figures.visor === value}
                  onPress={() => figures.setVisor(value)}
                />
              ))}
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow
            Mark={Icon.Sparkle}
            title="Kit"
            description="The fox that lives in the window. It is just there: it walks, sits and naps on its own."
          >
            <SegmentedControl size="sm" aria-label="Kit">
              <Choice
                label="On"
                pressed={figures.kit}
                onPress={() => figures.setKit(true)}
              />
              <Choice
                label="Off"
                pressed={!figures.kit}
                onPress={() => figures.setKit(false)}
              />
            </SegmentedControl>
          </SettingsRow>
        </SettingsBox>
      </SettingsSection>
      {figures.theo ? <FaceFeel /> : null}
    </SettingsPage>
  )
}
