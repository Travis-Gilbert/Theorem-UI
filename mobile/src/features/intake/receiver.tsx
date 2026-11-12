// SOURCING: react-native Modal (pageSheet), FlatList; chat.projects and chat.threads through features/chat/threads; kv (local-db.ts) for the last choice
//
// Which existing conversation receives a delivery. Only Theorem conversations
// are offered: they are the sessions with an uploads route. Claude Code and
// Codex on a computer are named, with the reason they cannot take a file yet.
import { useEffect, useState } from 'react'
import { FlatList, Modal, Pressable, StyleSheet, View } from 'react-native'
import { loadProjects, loadThreads, threadDetail, threadTitle } from '@/features/chat/threads'
import { kv } from '@/lib/local-db'
import { describeError, theorem, type Theorem } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import type { Receiver } from './model'

const LAST = 'intake.last-receiver'

export function lastReceiver(): Receiver | undefined {
  try {
    return (JSON.parse(kv.get(LAST) ?? 'null') as Receiver | null) ?? undefined
  } catch {
    return undefined
  }
}

export const rememberReceiver = (receiver: Receiver) => kv.set(LAST, JSON.stringify(receiver))

/** The receiver for a thread id from a link, read from Theorem. Nothing is assumed about a thread it cannot read. */
export async function receiverOfThread(threadId: string): Promise<Receiver> {
  const { thread, project } = await theorem().chat.threads.get({ threadId })
  return {
    kind: 'theorem-thread',
    projectId: project.projectId,
    threadId: thread.threadId,
    title: threadTitle(thread),
    projectTitle: project.title,
  }
}

export function ReceiverPicker({
  visible,
  current,
  onChoose,
  onClose,
}: {
  visible: boolean
  current: Receiver | undefined
  onChoose: (receiver: Receiver) => void
  onClose: () => void
}) {
  const { palette } = useTheme()
  const projects = useRequest(loadProjects, [])
  const [projectId, setProjectId] = useState(current?.projectId)
  useEffect(() => {
    if (!projectId && projects.data?.length) setProjectId(projects.data[0]!.projectId)
  }, [projectId, projects.data])
  const project = projects.data?.find((entry) => entry.projectId === projectId)
  const threads = useRequest<Theorem.ThreadPage | undefined>(
    () => (projectId ? loadThreads(projectId) : Promise.resolve(undefined)),
    [projectId],
  )

  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: palette.neutral }]}>
        <View style={styles.head}>
          <Text variant="title" accessibilityRole="header">
            Send to
          </Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={onClose} hitSlop={12}>
            <Text variant="strong" tone="accent">
              Done
            </Text>
          </Pressable>
        </View>
        {projects.status === 'failed' ? (
          <View style={styles.pad}>
            <Text tone="error">{describeError(projects.error)}</Text>
            <Button label="Try again" onPress={projects.reload} />
          </View>
        ) : null}
        {(projects.data?.length ?? 0) > 1 ? (
          <View style={styles.projects}>
            {projects.data!.map((entry) => (
              <Button
                key={entry.projectId}
                label={entry.title}
                variant={entry.projectId === projectId ? 'primary' : 'secondary'}
                onPress={() => setProjectId(entry.projectId)}
              />
            ))}
          </View>
        ) : null}
        <FlatList
          data={threads.data?.items ?? []}
          keyExtractor={(thread) => thread.threadId}
          contentContainerStyle={styles.list}
          ListEmptyComponent={
            <View style={styles.pad}>
              <Text tone={threads.status === 'failed' ? 'error' : 'muted'}>
                {threads.status === 'failed'
                  ? describeError(threads.error)
                  : threads.status === 'loading' || projects.status === 'loading'
                    ? 'Loading conversations…'
                    : 'This project has no conversations yet. Start one in Chat, then share into it.'}
              </Text>
            </View>
          }
          ListFooterComponent={
            <View style={styles.pad}>
              <Text variant="label" tone="muted">
                Claude Code and Codex conversations on your computers are not listed. The app can type into them,
                but it has no way yet to put a file on the computer and confirm the agent was given it.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const selected = current?.threadId === item.threadId
            return (
              <View style={{ backgroundColor: palette.raised }}>
                <Row
                  title={threadTitle(item)}
                  detail={threadDetail(item)}
                  selected={selected}
                  trailing={selected ? <Text tone="accent">✓</Text> : undefined}
                  onPress={() =>
                    project &&
                    onChoose({
                      kind: 'theorem-thread',
                      projectId: project.projectId,
                      threadId: item.threadId,
                      title: threadTitle(item),
                      projectTitle: project.title,
                    })
                  }
                />
              </View>
            )
          }}
        />
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  head: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  projects: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.sm },
  list: { paddingBottom: space.xl * 2 },
  pad: { padding: space.lg, gap: space.sm },
})
