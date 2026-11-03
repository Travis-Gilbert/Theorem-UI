// SOURCING: next-themes (light/dark), lib/palette (colours), coss ui SegmentedControl, the settings frame
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
import { PALETTES, usePalette } from '@/lib/palette'

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
  return (
    <SettingsPage title="Appearance" description="How Theorem looks on this device.">
      <SettingsSection title="Display">
        <SettingsBox>
          <SettingsRow Mark={Icon.Sun} title="Theme" description="Light, dark, or whatever the system uses.">
            <SegmentedControl size="sm" aria-label="Theme">
              {THEMES.map(({ value, label }) => (
                <Choice key={value} label={label} pressed={theme === value} onPress={() => setTheme(value)} />
              ))}
            </SegmentedControl>
          </SettingsRow>
          <SettingsRow Mark={Icon.Layout} title="Colors" description="The palette for both themes.">
            <SegmentedControl size="sm" aria-label="Colors">
              {PALETTES.map(({ value, label }) => (
                <Choice key={value} label={label} pressed={palette === value} onPress={() => setPalette(value)} />
              ))}
            </SegmentedControl>
          </SettingsRow>
        </SettingsBox>
      </SettingsSection>
    </SettingsPage>
  )
}
