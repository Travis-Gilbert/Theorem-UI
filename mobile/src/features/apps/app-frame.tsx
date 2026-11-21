// SOURCING: ./app-host-view (the web's App host in a WebView); the card follows src/ui tokens
//
// One App revision in a reply, run by the web's own App frame: interactive,
// with the saved state it had when the revision is still current. Changes made
// in it stay in it, as on the web's pinned revisions.
import { memo, useRef, useState } from 'react'
import { StyleSheet, View } from 'react-native'
import { radius, space } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { Unavailable } from '@/ui/unavailable'
import { AppHostView, type AppHostHandle } from './app-host-view'
import type { AppRevision } from './operations'

/** The height before the App says how tall it is. */
const FIRST_HEIGHT = 360
const MAX_HEIGHT = 20000

export const AppFrame = memo(function AppFrame({ app }: { app: AppRevision }) {
  const { palette } = useTheme()
  const host = useRef<AppHostHandle>(null)
  const [height, setHeight] = useState(FIRST_HEIGHT)
  const [error, setError] = useState<string>()
  return (
    <View style={[styles.card, { borderColor: palette.lineSeparator, backgroundColor: palette.raised }]}>
      <View style={styles.title}>
        <Text variant="label" numberOfLines={1} style={styles.name}>
          {app.title}
        </Text>
        <Text variant="label" tone="muted">
          App{app.position ? ` · v${app.position}` : ''}
        </Text>
      </View>
      {error ? (
        <Unavailable title="This App cannot run here" reason={error} />
      ) : (
        <AppHostView
          ref={host}
          style={{ height }}
          onHostError={setError}
          onHostMessage={(message) => {
            if (message.type === 'ready')
              host.current?.send({
                type: 'show',
                html: app.html,
                title: app.title,
                documentId: app.documentId,
                position: app.position,
              })
            else if (message.type === 'height' && message.height > 0)
              setHeight(Math.min(MAX_HEIGHT, message.height))
          }}
        />
      )}
    </View>
  )
})

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  title: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  name: { flex: 1 },
})
