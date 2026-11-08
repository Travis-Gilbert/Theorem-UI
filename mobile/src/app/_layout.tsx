// SOURCING: expo-router Stack with Stack.Protected (signed-in routes), expo-font useFonts with @expo-google-fonts families, react-native-safe-area-context
import '@/lib/polyfills'
import { useEffect, useState } from 'react'
import { StatusBar } from 'expo-status-bar'
import * as Linking from 'expo-linking'
import { router, Stack } from 'expo-router'
import { useFonts } from 'expo-font'
import { SafeAreaProvider } from 'react-native-safe-area-context'
// One module per weight, so only these six files are bundled.
import { Manrope_500Medium } from '@expo-google-fonts/manrope/500Medium'
import { Manrope_700Bold } from '@expo-google-fonts/manrope/700Bold'
import { IBMPlexSans_400Regular } from '@expo-google-fonts/ibm-plex-sans/400Regular'
import { IBMPlexSans_600SemiBold } from '@expo-google-fonts/ibm-plex-sans/600SemiBold'
import { IBMPlexMono_400Regular } from '@expo-google-fonts/ibm-plex-mono/400Regular'
import { JetBrainsMono_400Regular } from '@expo-google-fonts/jetbrains-mono/400Regular'
import { BrowserHost } from '@/features/browser/browser-host'
import { resetConversations } from '@/features/chat/runtime'
import { restore, useAuth } from '@/lib/auth'
import { clearAccountData } from '@/lib/local-db'
import { rememberDestination, takeDestination } from '@/lib/pending-destination'
import { assertRuntime } from '@/lib/polyfills'
import { Text } from '@/ui/text'
import { ThemeProvider, useTheme } from '@/ui/theme'

assertRuntime()

function Navigation() {
  const auth = useAuth()
  const { palette, scheme } = useTheme()
  const signedIn = auth.status === 'signed-in'
  const [wasSignedIn, setWasSignedIn] = useState<boolean>()

  useEffect(() => {
    if (auth.status === 'loading') return
    if (wasSignedIn === true && !signedIn) {
      // Another account must not inherit this one's journals or drafts.
      resetConversations()
      clearAccountData()
    }
    if (wasSignedIn === false && signedIn) {
      const destination = takeDestination()
      if (destination) router.replace(destination as never)
    }
    setWasSignedIn(signedIn)
  }, [auth.status, signedIn, wasSignedIn])

  // A link that arrives while the sign-in screen is up opens after sign-in, as the launch link does.
  useEffect(() => {
    if (signedIn) return
    const subscription = Linking.addEventListener('url', ({ url }) => rememberDestination(url))
    return () => subscription.remove()
  }, [signedIn])

  if (auth.status === 'loading') return null
  return (
    <>
      <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />
      <Stack
        screenOptions={{
          headerShown: false,
          contentStyle: { backgroundColor: palette.neutral },
        }}
      >
        <Stack.Protected guard={signedIn}>
          <Stack.Screen name="(tabs)" />
          <Stack.Screen
            name="settings"
            options={{ presentation: 'modal', headerShown: true, title: 'Settings' }}
          />
          <Stack.Screen
            name="computer"
            options={{ presentation: 'modal', headerShown: true, title: 'Add a computer' }}
          />
          <Stack.Screen name="terminal" options={{ presentation: 'fullScreenModal', headerShown: true }} />
        </Stack.Protected>
        <Stack.Protected guard={!signedIn}>
          <Stack.Screen name="sign-in" />
        </Stack.Protected>
      </Stack>
      {signedIn ? <BrowserHost /> : null}
    </>
  )
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    Manrope_500Medium,
    Manrope_700Bold,
    IBMPlexSans_400Regular,
    IBMPlexSans_600SemiBold,
    IBMPlexMono_400Regular,
    JetBrainsMono_400Regular,
  })
  useEffect(() => {
    void Linking.getInitialURL().then(rememberDestination)
    void restore()
  }, [])
  if (!fontsLoaded && !fontError) return null
  return (
    <SafeAreaProvider>
      <ThemeProvider>
        {fontError ? <Text tone="error">Fonts failed to load: {fontError.message}</Text> : null}
        <Navigation />
      </ThemeProvider>
    </SafeAreaProvider>
  )
}
