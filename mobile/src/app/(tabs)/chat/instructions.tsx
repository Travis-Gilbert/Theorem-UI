// SOURCING: react-native TextInput; chat.projects.update through features/chat/threads (If-Match from the revision read, as the web client does); expo-crypto randomUUID
//
// What the agent is told in a project. Save writes the text and closes the
// sheet; a failure stays on screen with the text kept. Nothing is retried on
// its own beyond the one re-read a stale revision needs.
import { useRef, useState } from 'react'
import { ScrollView, StyleSheet, TextInput } from 'react-native'
import * as Crypto from 'expo-crypto'
import { router, useLocalSearchParams } from 'expo-router'
import { loadProject, saveInstructions } from '@/features/chat/threads'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

export default function InstructionsSheet() {
  const { palette } = useTheme()
  const { project: projectId } = useLocalSearchParams<{ project?: string }>()
  const project = useRequest(() => (projectId ? loadProject(projectId) : Promise.resolve(undefined)), [projectId])
  const [draft, setDraft] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<unknown>()
  // One key per text, so pressing Save again after a lost response is the same write.
  const key = useRef<{ text: string; key: string }>(undefined)

  const text = draft ?? project.data?.instructions ?? ''
  const changed = draft !== undefined && draft !== project.data?.instructions

  const save = async () => {
    if (!projectId || busy) return
    if (key.current?.text !== text) key.current = { text, key: Crypto.randomUUID() }
    setBusy(true)
    setError(undefined)
    try {
      await saveInstructions(projectId, text, key.current.key)
      router.back()
    } catch (failure) {
      setError(failure)
      setBusy(false)
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text variant="strong" accessibilityRole="header">
        {project.data ? `${project.data.title} instructions` : 'Instructions'}
      </Text>
      {project.status === 'loading' && !project.data ? (
        <StatusLabel tone="live" label="Loading" />
      ) : project.status === 'failed' && !project.data ? (
        <>
          <Text tone="error">{describeError(project.error)}</Text>
          <Button label="Try again" onPress={project.reload} />
        </>
      ) : (
        <>
          <TextInput
            value={text}
            onChangeText={setDraft}
            multiline
            autoFocus
            placeholder="Tell Theo how to work in this project"
            placeholderTextColor={palette.inkMuted}
            accessibilityLabel="Project instructions"
            style={[styles.input, { color: palette.ink, borderColor: palette.lineControl, backgroundColor: palette.raised }]}
          />
          {error ? (
            <Text tone="error" accessibilityRole="alert">
              {describeError(error)}
            </Text>
          ) : null}
          <Button label="Save" variant="primary" busy={busy} disabled={!changed} onPress={() => void save()} />
        </>
      )}
    </ScrollView>
  )
}

const styles = StyleSheet.create({
  content: { padding: space.lg, gap: space.md },
  input: {
    minHeight: 160,
    padding: space.md,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    fontSize: 16,
    textAlignVertical: 'top',
  },
})
