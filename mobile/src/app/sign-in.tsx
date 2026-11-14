// SOURCING: lib/auth.ts (system sign-in sheet; development token in debug builds only); react-native KeyboardAvoidingView and ScrollView keep the token field and its button above the keyboard
import { useState } from 'react'
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { signIn, signInWithDevelopmentToken, useAuth } from '@/lib/auth'
import { config } from '@/lib/config'
import { describeError } from '@/lib/theorem'
import { fonts, radius, space, touchTarget } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

export default function SignInScreen() {
  const { palette } = useTheme()
  const auth = useAuth()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string>()
  const [token, setToken] = useState('')
  const reason = auth.status === 'signed-out' ? auth.reason : undefined

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (failure) {
      setError(describeError(failure))
    } finally {
      setBusy(false)
    }
  }

  const submitToken = () => {
    if (token.trim()) void run(() => signInWithDevelopmentToken(token))
  }

  return (
    <SafeAreaView style={[styles.fill, { backgroundColor: palette.neutral }]}>
      <KeyboardAvoidingView style={styles.fill} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          <Text variant="title" accessibilityRole="header">
            Theorem
          </Text>
          <Text tone="muted">
            Sign in to work with your agents. Hosted Theorem agents need no computer of your own.
          </Text>
          {reason ? (
            <Text variant="label" tone="attention" accessibilityRole="alert">
              {reason}
            </Text>
          ) : null}
          <Button label="Sign in" variant="primary" busy={busy} onPress={() => void run(signIn)} />
          <Text variant="meta" tone="faint">
            {new URL(config.authority).host}
          </Text>
          {error ? (
            <Text variant="label" tone="error" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {__DEV__ ? (
            <View style={[styles.dev, { borderColor: palette.lineSeparator }]}>
              <Text variant="label" tone="muted">
                Development build: use a bearer from the authority&apos;s operator until this app&apos;s
                sign-in client is registered.
              </Text>
              <TextInput
                value={token}
                onChangeText={setToken}
                placeholder="Bearer token"
                placeholderTextColor={palette.inkFaint}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="go"
                onSubmitEditing={submitToken}
                accessibilityLabel="Development bearer token"
                style={[
                  styles.input,
                  { color: palette.ink, borderColor: palette.lineControl, backgroundColor: palette.raised },
                ]}
              />
              <Button label="Use token" disabled={!token.trim()} onPress={submitToken} />
            </View>
          ) : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  body: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: space.xl,
    gap: space.md,
    maxWidth: 520,
    width: '100%',
    alignSelf: 'center',
  },
  dev: { marginTop: space.xl, paddingTop: space.lg, borderTopWidth: StyleSheet.hairlineWidth, gap: space.sm },
  input: {
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: fonts.meta,
  },
})
