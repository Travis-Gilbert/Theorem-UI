// SOURCING: theorem-session local Expo module (Remux-derived native sessions); expo-router Stack.Screen header
import { Pressable, StyleSheet, View } from 'react-native'
import { router, Stack } from 'expo-router'
import { sessionSupport, TheoremSessionView } from '../../modules/theorem-session'
import { Screen } from '@/ui/screen'
import { Text } from '@/ui/text'
import { Unavailable } from '@/ui/unavailable'

/**
 * Terminal sessions on the person's own computers. Closing this screen detaches
 * the device; tmux and Herdr sessions keep running on their host.
 */
export default function SessionScreen() {
  const support = sessionSupport()
  return (
    <>
      <Stack.Screen
        options={{
          title: 'Terminal sessions',
          headerRight: () => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Done"
              accessibilityHint="Leaves sessions running on their computers"
              hitSlop={12}
              onPress={() => (router.canGoBack() ? router.back() : router.replace('/platinum'))}
            >
              <Text variant="strong" tone="accent">
                Done
              </Text>
            </Pressable>
          ),
        }}
      />
      {support.available ? (
        <View style={styles.fill}>
          <TheoremSessionView style={styles.fill} />
        </View>
      ) : (
        <Screen scroll>
          <Unavailable title="Terminal sessions are not available in this build" reason={support.reason} />
        </Screen>
      )}
    </>
  )
}

const styles = StyleSheet.create({ fill: { flex: 1 } })
