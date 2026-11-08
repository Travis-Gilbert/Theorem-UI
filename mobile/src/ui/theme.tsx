// SOURCING: react-native useColorScheme and AccessibilityInfo (reduced motion); preference kept in the device kv table
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AccessibilityInfo, useColorScheme } from 'react-native'
import { kv } from '@/lib/local-db'
import { palettes, type Palette, type Scheme } from '@/theme/tokens'

export type Preference = 'system' | Scheme

type Theme = {
  scheme: Scheme
  palette: Palette
  preference: Preference
  setPreference: (preference: Preference) => void
  reduceMotion: boolean
}

const ThemeContext = createContext<Theme | undefined>(undefined)
const KEY = 'appearance'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [preference, setPreferenceState] = useState<Preference>(
    () => (kv.get(KEY) as Preference | undefined) ?? 'system',
  )
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion)
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    return () => subscription.remove()
  }, [])
  const scheme: Scheme = preference === 'system' ? (system === 'light' ? 'light' : 'dark') : preference
  const value = useMemo<Theme>(
    () => ({
      scheme,
      palette: palettes[scheme],
      preference,
      setPreference: (next) => {
        kv.set(KEY, next)
        setPreferenceState(next)
      },
      reduceMotion,
    }),
    [scheme, preference, reduceMotion],
  )
  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): Theme {
  const theme = use(ThemeContext)
  if (!theme) throw new Error('useTheme outside ThemeProvider')
  return theme
}
