// SOURCING: the theorem-session computers() save and trustHostKey (Remux's SSH sign-in check, Keychain credential store and trusted host store); react-native TextInput; expo-crypto randomUUID
//
// Adds a computer the person reaches over SSH. Theorem signs in once to check
// the details before anything is saved. The password or key stays in this
// screen's memory until it is saved to the Keychain by the native module, and
// is never read back. A host key is shown with its fingerprint and trusted
// only when the person says so.
import { useRef, useState } from 'react'
import { Pressable, ScrollView, StyleSheet, TextInput, View, type TextInputProps } from 'react-native'
import { router } from 'expo-router'
import * as Crypto from 'expo-crypto'
import { refreshComputers } from '@/features/agents/computers'
import { NoteStrip } from '@/features/chat/conversation-surface'
import { describeError } from '@/lib/theorem'
import { fonts, radius, space, touchTarget, type as typeScale } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Screen } from '@/ui/screen'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { Unavailable } from '@/ui/unavailable'
import { computers, NO_NATIVE_MODULE, type ComputerCredential, type HostKeyChallenge } from '../../modules/theorem-session'

type Method = 'password' | 'privateKey'

function Field({ label, code, ...props }: TextInputProps & { label: string; code?: boolean }) {
  const { palette } = useTheme()
  return (
    <View style={styles.field}>
      <Text variant="label" tone="muted">
        {label}
      </Text>
      <TextInput
        accessibilityLabel={label}
        autoCapitalize="none"
        autoCorrect={false}
        spellCheck={false}
        placeholderTextColor={palette.inkFaint}
        {...props}
        style={[
          styles.input,
          { color: palette.ink, borderColor: palette.lineControl, backgroundColor: palette.composer },
          code && styles.code,
          props.multiline && styles.multiline,
        ]}
      />
    </View>
  )
}

export default function AddComputerScreen() {
  const { palette } = useTheme()
  const api = computers()
  // One id for this computer, so a second try after trusting its key saves the same one.
  const id = useRef(Crypto.randomUUID())
  const [name, setName] = useState('')
  const [host, setHost] = useState('')
  const [port, setPort] = useState('22')
  const [username, setUsername] = useState('')
  const [method, setMethod] = useState<Method>('password')
  const [password, setPassword] = useState('')
  const [privateKey, setPrivateKey] = useState('')
  const [passphrase, setPassphrase] = useState('')
  const [busy, setBusy] = useState<string>()
  const [error, setError] = useState<unknown>()
  const [challenge, setChallenge] = useState<HostKeyChallenge>()

  if (!api)
    return (
      <Screen scroll>
        <Unavailable title="Computers are not available in this build" reason={NO_NATIVE_MODULE} />
      </Screen>
    )

  const credential = (): ComputerCredential =>
    method === 'password'
      ? { kind: 'password', password }
      : { kind: 'privateKey', privateKey, passphrase: passphrase || undefined }

  const portNumber = Number(port)
  const complete =
    !!host.trim() &&
    !!username.trim() &&
    Number.isInteger(portNumber) &&
    (method === 'password' ? !!password : !!privateKey.trim())

  const save = async () => {
    setBusy('Signing in to check the details…')
    setError(undefined)
    try {
      const outcome = await api.save({
        id: id.current,
        name: name.trim(),
        host: host.trim(),
        port: portNumber,
        username: username.trim(),
        credential: credential(),
      })
      if (outcome.kind === 'host-key') return setChallenge(outcome.challenge)
      setChallenge(undefined)
      void refreshComputers()
      router.back()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(undefined)
    }
  }

  const trust = async () => {
    if (!challenge) return
    setBusy('Trusting the key…')
    try {
      await api.trustHostKey(id.current, challenge.fingerprint)
      setChallenge(undefined)
    } catch (caught) {
      setBusy(undefined)
      return setError(caught)
    }
    await save()
  }

  return (
    <Screen>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
        <Text tone="muted">
          Theorem connects over SSH to read Claude Code and Codex conversations on this computer and to type your
          replies into them. It signs in once now to check these details.
        </Text>
        <Field label="Name" value={name} onChangeText={setName} placeholder="Studio Mac" autoCapitalize="words" />
        <Field
          label="Host"
          value={host}
          onChangeText={setHost}
          placeholder="studio.local or 100.64.0.2"
          keyboardType="url"
          textContentType="URL"
        />
        <View style={styles.pair}>
          <View style={styles.grow}>
            <Field
              label="User name"
              value={username}
              onChangeText={setUsername}
              textContentType="username"
              autoComplete="username"
            />
          </View>
          <View style={styles.port}>
            <Field label="Port" value={port} onChangeText={setPort} keyboardType="number-pad" />
          </View>
        </View>

        <View style={styles.field}>
          <Text variant="label" tone="muted">
            Sign in with
          </Text>
          <View style={[styles.segments, { borderColor: palette.lineControl }]} accessibilityRole="radiogroup">
            {(
              [
                ['password', 'Password'],
                ['privateKey', 'Private key'],
              ] as const
            ).map(([value, label]) => {
              const active = method === value
              return (
                <Pressable
                  key={value}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: active }}
                  onPress={() => setMethod(value)}
                  style={[styles.segment, { backgroundColor: active ? palette.raised : 'transparent' }]}
                >
                  <Text variant={active ? 'strong' : 'body'} tone={active ? 'ink' : 'muted'}>
                    {label}
                  </Text>
                </Pressable>
              )
            })}
          </View>
        </View>

        {method === 'password' ? (
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            secureTextEntry
            textContentType="password"
            autoComplete="password"
          />
        ) : (
          <>
            <Field
              label="Private key"
              value={privateKey}
              onChangeText={setPrivateKey}
              placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
              multiline
              code
            />
            <Field
              label="Passphrase, if the key has one"
              value={passphrase}
              onChangeText={setPassphrase}
              secureTextEntry
            />
          </>
        )}

        {challenge ? (
          <NoteStrip
            note={{
              tone: challenge.kind === 'changed' ? 'error' : 'attention',
              text:
                challenge.kind === 'changed'
                  ? `${challenge.host} now presents a different host key (${challenge.keyType} ${challenge.fingerprint}). Someone may be intercepting the connection. Trust it only if you changed the computer's key.`
                  : `${challenge.host} is new to this device. Its key is ${challenge.keyType} ${challenge.fingerprint}. Trust it if this matches the computer's key.`,
            }}
          />
        ) : null}
        {error ? <NoteStrip note={{ tone: 'error', text: describeError(error) }} /> : null}
        {busy ? (
          <Text variant="label" tone="muted">
            {busy}
          </Text>
        ) : null}

        {challenge ? (
          <Button label="Trust and add" variant="primary" busy={!!busy} onPress={trust} />
        ) : (
          <Button label="Add computer" variant="primary" busy={!!busy} disabled={!complete} onPress={save} />
        )}
        <Button label="Cancel" variant="quiet" onPress={() => router.back()} />
      </ScrollView>
    </Screen>
  )
}

const styles = StyleSheet.create({
  scroll: { padding: space.lg, gap: space.lg, paddingBottom: space.xl * 2 },
  field: { gap: space.xs },
  input: {
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.control,
    fontFamily: fonts.ui,
    ...typeScale.body,
  },
  code: { fontFamily: fonts.code },
  multiline: { minHeight: 120, paddingTop: space.sm, textAlignVertical: 'top' },
  pair: { flexDirection: 'row', gap: space.md },
  grow: { flex: 1 },
  port: { width: 88 },
  segments: {
    flexDirection: 'row',
    padding: 2,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.control,
  },
  segment: {
    flex: 1,
    minHeight: touchTarget - 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.control - 2,
  },
})
