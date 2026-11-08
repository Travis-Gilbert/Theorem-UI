// SOURCING: documents.get through @/features/library/notes; the Markdown projection shown as selectable text
import { ScrollView, StyleSheet, View } from 'react-native'
import { Stack, useLocalSearchParams } from 'expo-router'
import { LinkedText } from '@/features/chat/linked-text'
import { readNote } from '@/features/library/notes'
import { describeError, statusOf } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { Unavailable } from '@/ui/unavailable'

export default function NoteScreen() {
  const { documentId } = useLocalSearchParams<{ documentId: string }>()
  const note = useRequest(() => readNote(documentId), [documentId])
  if (note.status === 'failed') {
    const status = statusOf(note.error)
    return (
      <Unavailable
        title={status === 404 ? 'This note no longer exists' : 'The note did not load'}
        reason={describeError(note.error)}
      >
        {status === 404 ? null : <Button label="Try again" onPress={note.reload} />}
      </Unavailable>
    )
  }
  if (note.status === 'loading' && !note.data)
    return (
      <View style={styles.message}>
        <StatusLabel tone="live" label="Loading note" />
      </View>
    )
  const data = note.data!
  return (
    <>
      <Stack.Screen options={{ title: data.title || 'Note' }} />
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
        <Text variant="label" tone="muted">
          Editing notes on iPhone is not available yet; edit this note on theorem.rs.
        </Text>
        <LinkedText text={data.markdown || 'This note is empty.'} />
      </ScrollView>
    </>
  )
}

const styles = StyleSheet.create({
  body: { padding: space.lg, gap: space.lg },
  message: { padding: space.xl, alignItems: 'center' },
})
