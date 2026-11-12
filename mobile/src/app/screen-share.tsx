// SOURCING: modules/theo-capture (support, start, stop, stats, speak, onState, onFrame); react-native AppState; expo-image for the still; features/screen-share/session for every word shown
//
// The feasibility prototype for "look at my screen" (docs/plans/theo-iphone.md
// §1). It answers one question on a real phone: does user-started sharing of
// the whole screen, with the microphone, keep working while the person uses
// other apps? It sends nothing anywhere unless the person hands a still to a
// conversation themselves.
import { useEffect, useReducer, useState } from 'react'
import { AppState, StyleSheet, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { Image } from 'expo-image'
import { router } from 'expo-router'
import { keep } from '@/features/intake/files'
import { stage } from '@/features/intake/staged'
import {
  deviceChecks,
  initial,
  reduce,
  staleness,
  statusLine,
  type Staleness,
} from '@/features/screen-share/session'
import { describeError } from '@/lib/theorem'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { Screen, Section } from '@/ui/screen'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { Unavailable } from '@/ui/unavailable'
import { capture, captureSupport } from '../../modules/theo-capture'

const stillWords: Record<Staleness, string> = {
  live: 'This is the screen now.',
  old: 'This still is more than a few seconds old. It is not the screen now.',
  ended: 'Sharing has ended. This is the last still, not the screen now.',
  none: 'No still yet.',
}

export default function ScreenShareScreen() {
  const { palette } = useTheme()
  const support = captureSupport()
  const module = capture()
  const [session, dispatch] = useReducer(reduce, initial)
  const [now, setNow] = useState(Date.now())
  const [error, setError] = useState<unknown>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (!module) return
    const state = module.addListener('onState', (event) =>
      dispatch({ type: 'state', ...event, atMs: Date.now() }),
    )
    const frame = module.addListener('onFrame', (event) =>
      dispatch({ type: 'frame', frame: event, appActive: AppState.currentState === 'active' }),
    )
    // Counts come from the module, so frames delivered while JavaScript was suspended are not lost.
    const clock = setInterval(() => {
      setNow(Date.now())
      const stats = module.stats()
      dispatch({ type: 'stats', frames: stats.frames, microphoneBuffers: stats.microphoneBuffers })
    }, 1_000)
    return () => {
      state.remove()
      frame.remove()
      clearInterval(clock)
      // Leaving this screen is not stopping: sharing goes on until the person stops it, here or in the system control.
    }
  }, [module])

  if (!module || support.route === 'none')
    return (
      <Screen scroll>
        <Unavailable title="Screen sharing is not available in this build" reason={support.reason} />
      </Screen>
    )

  const run = async (action: () => Promise<void>) => {
    setBusy(true)
    setError(undefined)
    try {
      await action()
    } catch (caught) {
      setError(caught)
    } finally {
      setBusy(false)
    }
  }
  const line = statusLine(session)
  const active = session.phase === 'capturing' || session.phase === 'picking'
  const still = staleness(session, now)

  const give = () => {
    if (!session.frame) return
    const { frame } = session
    try {
      const item = keep(Crypto.randomUUID(), 'screen', {
        uri: frame.uri,
        name: `screen-${new Date(frame.capturedAtMs).toISOString().replace(/[:.]/g, '-')}.jpg`,
        mimeType: 'image/jpeg',
      })
      stage([item])
      router.push('/intake')
    } catch (caught) {
      setError(caught)
    }
  }

  return (
    <Screen scroll edges={['left', 'right', 'bottom']}>
      <View style={styles.pad}>
        <StatusLabel tone={line.tone} label={line.label} />
        <Text tone="muted">{line.detail}</Text>
        {error ? <Text tone="error">{describeError(error)}</Text> : null}
        <View style={styles.actions}>
          {active ? (
            <Button label="Stop sharing" variant="destructive" busy={busy} onPress={() => void run(() => module.stop())} />
          ) : (
            <Button
              label="Share my screen…"
              variant="primary"
              busy={busy}
              onPress={() => void run(() => module.start(true))}
            />
          )}
          <Button
            label="Speak a test line"
            disabled={session.phase !== 'capturing'}
            onPress={() => void run(() => module.speak('This is Theo, speaking while your screen is shared.'))}
          />
        </View>
      </View>

      <Section title="What the system delivered">
        <Row title="Frames delivered" detail={String(session.frames)} />
        <Row title="Frames while this app was not in front" detail={String(session.framesWhileAway)} />
        <Row
          title="Microphone buffers"
          detail={session.microphone ? String(session.microphoneBuffers) : 'The microphone is off'}
        />
        <Row title="Route" detail="ScreenCaptureKit, iOS 27" />
      </Section>

      {session.frame ? (
        <View style={styles.pad}>
          <Text variant="label" tone="muted" accessibilityRole="header">
            STILL {session.frame.sequence} ·{' '}
            {new Date(session.frame.capturedAtMs).toLocaleTimeString(undefined, { timeStyle: 'medium' })}
          </Text>
          <Image
            source={{ uri: session.frame.uri }}
            style={[
              styles.still,
              { aspectRatio: session.frame.width / session.frame.height, backgroundColor: palette.raised },
            ]}
            contentFit="contain"
            accessibilityLabel={`Still ${session.frame.sequence} of the shared screen`}
          />
          <Text tone={still === 'live' ? 'muted' : 'attention'}>{stillWords[still]}</Text>
          <Button label="Give this still to a conversation…" onPress={give} />
        </View>
      ) : null}

      <Section title="Checks to make on the phone">
        {deviceChecks(session).map((item) => (
          <Row
            key={item.check}
            title={item.check}
            detail={item.how}
            wrap
            trailing={item.seen ? <Text tone="success">✓ seen</Text> : <Text tone="faint">yours</Text>}
          />
        ))}
      </Section>
    </Screen>
  )
}

const styles = StyleSheet.create({
  pad: { marginHorizontal: space.lg, marginTop: space.lg, gap: space.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.xs },
  still: { width: '100%', maxHeight: 420, borderRadius: radius.card },
})
