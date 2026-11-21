// SOURCING: react-native useColorScheme, Appearance and AccessibilityInfo (reduced motion/transparency); preference kept in the device kv table
import { createContext, use, useEffect, useMemo, useState, type ReactNode } from 'react'
import { AccessibilityInfo, Appearance, Platform, useColorScheme } from 'react-native'
import { kv } from '@/lib/local-db'
import { palettes, type Palette, type Scheme } from '@/theme/tokens'

export type Preference = 'system' | Scheme

type Theme = {
  scheme: Scheme
  palette: Palette
  preference: Preference
  setPreference: (preference: Preference) => void
  reduceMotion: boolean
  reduceTransparency: boolean
}

const ThemeContext = createContext<Theme | undefined>(undefined)
const KEY = 'appearance'

export function ThemeProvider({ children }: { children: ReactNode }) {
  const system = useColorScheme()
  const [preference, setPreferenceState] = useState<Preference>(
    () => (kv.get(KEY) as Preference | undefined) ?? 'system',
  )
  const [reduceMotion, setReduceMotion] = useState(false)
  // Keep controls readable until the native transparency preference is known.
  const [reduceTransparency, setReduceTransparency] = useState(Platform.OS === 'ios')
  useEffect(() => {
    let mounted = true
    let changed = false
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (next) => {
      changed = true
      setReduceMotion(next)
    })
    void AccessibilityInfo.isReduceMotionEnabled().then((next) => {
      if (mounted && !changed) setReduceMotion(next)
    }).catch(() => {})
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])
  useEffect(() => {
    if (Platform.OS !== 'ios') return
    let mounted = true
    let changed = false
    const subscription = AccessibilityInfo.addEventListener('reduceTransparencyChanged', (next) => {
      changed = true
      setReduceTransparency(next)
    })
    void AccessibilityInfo.isReduceTransparencyEnabled().then((next) => {
      if (mounted && !changed) setReduceTransparency(next)
    }).catch(() => {
      // Keep the solid fallback if the initial preference cannot be read.
    })
    return () => {
      mounted = false
      subscription.remove()
    }
  }, [])
  // Native chrome (navigation bars, sheets, system glass) takes its light or dark from the window,
  // not from our palette. Pin the window to the chosen scheme; 'unspecified' hands it back to the system.
  useEffect(() => {
    Appearance.setColorScheme(preference === 'system' ? 'unspecified' : preference)
  }, [preference])
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
      reduceTransparency,
    }),
    [scheme, preference, reduceMotion, reduceTransparency],
  )
  return <ThemeContext value={value}>{children}</ThemeContext>
}

export function useTheme(): Theme {
  const theme = use(ThemeContext)
  if (!theme) throw new Error('useTheme outside ThemeProvider')
  return theme
}
