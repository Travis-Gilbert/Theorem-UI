// SOURCING: codemirror-theme-vitesse (ntnyq's port of Anthony Fu's Vitesse to CodeMirror, built on @uiw/codemirror-themes), @uiw/react-codemirror's own light and dark themes, next-themes (the mode) and lib/palette (the palette). Only the editor settings below are ours: they are the JetBrains Vitesse Dark scheme's (vitesse.dark.xml).
import type { ReactCodeMirrorProps } from '@uiw/react-codemirror'
import { createVitesseDarkTheme } from 'codemirror-theme-vitesse/dark'
import { vitesseLight } from 'codemirror-theme-vitesse/light'
import { useTheme } from 'next-themes'
import { usePalette } from '@/lib/palette'

/** Vitesse Dark on the scheme's #222222 editor, gutter and #383838 selection. */
const vitesseDark = createVitesseDarkTheme({
  settings: {
    background: '#222222',
    gutterBackground: '#222222',
    selection: '#383838',
    caret: '#aeafad',
    lineHighlight: '#292929',
  },
})

/** The CodeMirror theme for the current palette and mode. */
export function useCodeMirrorTheme(): NonNullable<ReactCodeMirrorProps['theme']> {
  const { resolvedTheme } = useTheme()
  const vitesse = usePalette((state) => state.palette === 'vitesse')
  const dark = resolvedTheme === 'dark'
  if (vitesse) return dark ? vitesseDark : vitesseLight
  return dark ? 'dark' : 'light'
}
