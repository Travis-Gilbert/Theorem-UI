// SOURCING: react-native FlatList with RefreshControl; chat.projects and chat.threads through ./threads
import { useRef, useState } from 'react'
import { FlatList, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native'
import * as Crypto from 'expo-crypto'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { createThread, loadProjects, loadThreads, threadDetail, threadTitle } from './threads'

/** Window width (points) from which the conversation sits beside the list. */
export const SPLIT_WIDTH = 768

export function ThreadList({
  selected,
  onOpen,
}: {
  selected: string | undefined
  onOpen: (threadId: string) => void
}) {
  const { palette } = useTheme()
  const projects = useRequest(loadProjects, [])
  const [projectId, setProjectId] = useState<string>()
  const project = projectId ?? projects.data?.[0]?.projectId
  const threads = useRequest(() => (project ? loadThreads(project) : Promise.resolve([])), [project])
  // One key per intended conversation: pressing again after a lost response
  // repeats the same create instead of making a second thread.
  const createKey = useRef<string>(undefined)
  const [creating, setCreating] = useState(false)
  const [createError, setCreateError] = useState<string>()

  const start = async () => {
    if (!project) return
    createKey.current ??= Crypto.randomUUID()
    setCreating(true)
    setCreateError(undefined)
    try {
      const thread = await createThread(project, createKey.current)
      createKey.current = undefined
      threads.reload()
      onOpen(thread.threadId)
    } catch (error) {
      setCreateError(describeError(error))
    } finally {
      setCreating(false)
    }
  }

  const header = (
    <View style={styles.header}>
      {projects.data && projects.data.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.projects}>
          {projects.data.map((item) => {
            const active = item.projectId === project
            return (
              <Pressable
                key={item.projectId}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                onPress={() => setProjectId(item.projectId)}
                style={[
                  styles.project,
                  {
                    backgroundColor: active ? palette.accentContainer : palette.raised,
                    borderColor: active ? palette.accent : palette.lineControl,
                  },
                ]}
              >
                <Text variant="label" tone={active ? 'accent' : 'ink'} numberOfLines={1}>
                  {item.title}
                </Text>
              </Pressable>
            )
          })}
        </ScrollView>
      ) : null}
      <Button
        label="New conversation"
        variant="primary"
        busy={creating}
        disabled={!project}
        onPress={start}
      />
      {createError ? (
        <Text variant="label" tone="error" accessibilityRole="alert">
          {createError}
        </Text>
      ) : null}
    </View>
  )

  if (projects.status === 'failed' && !projects.data)
    return (
      <View style={styles.message}>
        <Text tone="error">{describeError(projects.error)}</Text>
        <Button label="Try again" onPress={projects.reload} />
      </View>
    )

  return (
    <FlatList
      data={threads.data ?? []}
      keyExtractor={(thread) => thread.threadId}
      contentInsetAdjustmentBehavior="automatic"
      ListHeaderComponent={header}
      refreshControl={
        <RefreshControl
          refreshing={threads.status === 'loading' && !!threads.data}
          onRefresh={() => {
            projects.reload()
            threads.reload()
          }}
        />
      }
      ListEmptyComponent={
        <View style={styles.message}>
          {threads.status === 'loading' || projects.status === 'loading' ? (
            <StatusLabel tone="live" label="Loading conversations" />
          ) : threads.status === 'failed' ? (
            <>
              <Text tone="error">{describeError(threads.error)}</Text>
              <Button label="Try again" onPress={threads.reload} />
            </>
          ) : (
            <Text tone="muted">No conversations in this project yet.</Text>
          )}
        </View>
      }
      renderItem={({ item }) => (
        <Row
          title={threadTitle(item)}
          detail={threadDetail(item)}
          selected={item.threadId === selected}
          onPress={() => onOpen(item.threadId)}
        />
      )}
    />
  )
}

const styles = StyleSheet.create({
  header: { padding: space.lg, gap: space.md },
  projects: { gap: space.sm },
  project: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    minHeight: 36,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: { padding: space.xl, gap: space.md, alignItems: 'center' },
})
