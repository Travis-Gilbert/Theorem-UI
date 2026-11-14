// SOURCING: expo-router Stack.Screen and router; chat.projects and chat.threads through features/chat/threads; ui/row, ui/group-header
//
// A project's page, after Claude's: what the agent is told in this project (its
// instructions), then the project's conversations, and a New chat pill. Adding
// files is not here: Theorem has no route that puts a file into a project.
import { useCallback, useRef } from 'react'
import { FlatList, Pressable, StyleSheet, View } from 'react-native'
import { Image } from 'expo-image'
import { router, Stack, useFocusEffect, useLocalSearchParams } from 'expo-router'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import { paramsOf } from '@/features/chat/selection'
import { rememberDestination } from '@/features/chat/recipient-picker'
import { ThreadRow } from '@/features/chat/thread-row'
import { loadProject, loadThreads } from '@/features/chat/threads'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { radius, space, touchTarget } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { GroupHeader } from '@/ui/group-header'
import { Row } from '@/ui/row'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

export default function ProjectScreen() {
  const { palette } = useTheme()
  // The tab bar floats over the screen; its height is part of the bottom inset.
  const { bottom } = useSafeAreaInsets()
  const { project: projectId } = useLocalSearchParams<{ project?: string }>()
  const project = useRequest(() => (projectId ? loadProject(projectId) : Promise.resolve(undefined)), [projectId])
  const threads = useRequest(
    () => (projectId ? loadThreads(projectId) : Promise.resolve({ items: [] })),
    [projectId],
  )
  // Coming back from the instructions sheet shows what was saved.
  const reloadProject = project.reload
  const focused = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (focused.current) reloadProject()
      focused.current = true
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []),
  )

  const current = project.data
  const open = (threadId: string) =>
    router.dismissTo({ pathname: '/chat', params: { ...paramsOf({ kind: 'theorem', threadId }), project: projectId } })
  const startChat = () => {
    if (!current) return
    rememberDestination({ kind: 'theorem', projectId: current.projectId, projectTitle: current.title })
    router.dismissTo({ pathname: '/chat', params: { ...paramsOf({ kind: 'new' }), project: current.projectId } })
  }

  const failure = project.status === 'failed' && !project.data ? project : threads.status === 'failed' && !threads.data ? threads : undefined

  return (
    <View style={styles.fill}>
      <Stack.Screen options={{ title: current?.title ?? 'Project' }} />
      <FlatList
        data={threads.data?.items ?? []}
        keyExtractor={(thread) => thread.threadId}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <View>
            {current ? (
              <Row
                title="Instructions"
                detail={current.instructions.trim() || 'None set. Tell Theo how to work in this project.'}
                accessibilityHint="Edit the instructions"
                onPress={() => router.push({ pathname: '/chat/instructions', params: { project: current.projectId } })}
              />
            ) : null}
            <GroupHeader title="Conversations" onAdd={current ? startChat : undefined} addLabel="New chat in this project" />
          </View>
        }
        renderItem={({ item }) => (
          <ThreadRow thread={item} projectTitle={current?.title} onPress={() => open(item.threadId)} />
        )}
        ListEmptyComponent={
          <View style={styles.message}>
            {failure ? (
              <>
                <Text tone="error">{describeError(failure.error)}</Text>
                <Button
                  label="Try again"
                  onPress={() => {
                    project.reload()
                    threads.reload()
                  }}
                />
              </>
            ) : threads.status === 'loading' || project.status === 'loading' ? (
              <StatusLabel tone="live" label="Loading the project" />
            ) : !current ? (
              <Text tone="muted">That project is no longer there.</Text>
            ) : (
              <Text tone="muted">No conversations in this project yet.</Text>
            )}
          </View>
        }
      />
      {current ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="New chat in this project"
          onPress={startChat}
          style={({ pressed }) => [styles.pill, { bottom: bottom + space.md, backgroundColor: palette.accent, opacity: pressed ? 0.85 : 1 }]}
        >
          <Image source="sf:square.and.pencil" tintColor={palette.onAccent} style={styles.pillIcon} contentFit="contain" />
          <Text variant="strong" tone="onAccent">
            New chat
          </Text>
        </Pressable>
      ) : null}
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { paddingBottom: space.xl * 3 },
  message: { padding: space.xl, gap: space.md, alignItems: 'center' },
  pill: {
    position: 'absolute',
    right: space.lg,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    minHeight: touchTarget,
    paddingHorizontal: space.lg,
    borderRadius: radius.pill,
  },
  pillIcon: { width: 18, height: 18 },
})
