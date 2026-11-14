// SOURCING: ui/row.tsx
//
// One conversation as a row, wherever it is listed (History, a project page,
// search): the run's state as a leading glyph, then subject, state in words,
// and recency. Only what Theorem returned for the thread is shown.
import { Alert, StyleSheet, View } from 'react-native'
import { fullTime, recency } from '@/lib/time'
import type { Theorem } from '@/lib/theorem'
import { Row } from '@/ui/row'
import { Text } from '@/ui/text'
import { threadActivityMs, threadDetails, threadState, threadTitle } from './thread-model'

export function ThreadRow({
  thread,
  projectTitle,
  selected,
  onPress,
}: {
  thread: Theorem.Thread
  projectTitle?: string
  selected?: boolean
  onPress: () => void
}) {
  const state = threadState(thread)
  const title = threadTitle(thread)
  return (
    <Row
      prominence="regular"
      leading={
        <View style={styles.glyph} importantForAccessibility="no" accessibilityElementsHidden>
          <Text variant="label" tone={state?.tone ?? 'muted'}>
            {state?.symbol ?? '○'}
          </Text>
        </View>
      }
      title={title}
      detail={state?.label}
      detailTone={state?.tone}
      meta={recency(threadActivityMs(thread))}
      accessibilityLabel={[title, state?.label, fullTime(threadActivityMs(thread))].filter(Boolean).join(', ')}
      accessibilityHint="Long press for details"
      onLongPress={() => Alert.alert(title, threadDetails(thread, projectTitle))}
      selected={selected}
      onPress={onPress}
    />
  )
}

const styles = StyleSheet.create({ glyph: { width: 20, alignItems: 'center' } })
