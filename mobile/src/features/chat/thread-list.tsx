// SOURCING: react-native SectionList with RefreshControl; expo-router useFocusEffect; chat.projects and chat.threads through ./threads; saved computers and their agent conversations through features/agents/computers
//
// Every conversation the person can open, by who it is with: Theorem's agent
// in a project, then Claude Code and Codex on each saved computer. One button
// starts a new conversation; the composer there chooses who receives it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { describeError, type Theorem } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { refreshComputers, useComputers } from '../agents/computers'
import { folderName, type AgentConversation } from '../agents/discovery'
import { agentName } from '../agents/shell'
import { sameSelection, type Selection } from './selection'
import { loadProjects, loadThreads, threadDetail, threadTitle } from './threads'

/** Window width (points) from which the conversation sits beside the list. */
export const SPLIT_WIDTH = 768

type Item =
  | { kind: 'thread'; key: string; thread: Theorem.Thread }
  | { kind: 'agent'; key: string; conversation: AgentConversation }
  | { kind: 'message'; key: string; text: string; tone: 'muted' | 'error'; action?: { label: string; onPress: () => void } }

type Section = { key: string; title: string; checking?: boolean; data: Item[] }

const when = (ms: number) => new Date(ms).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

function conversationTitle(conversation: AgentConversation) {
  return conversation.title?.trim() || folderName(conversation.cwd) || agentName[conversation.agent]
}

function conversationDetail(conversation: AgentConversation) {
  return [agentName[conversation.agent], folderName(conversation.cwd), when(conversation.mtime * 1000)]
    .filter(Boolean)
    .join(' · ')
}

export function ThreadList({
  selected,
  onOpen,
}: {
  selected: Selection | undefined
  onOpen: (selection: Selection) => void
}) {
  const { palette } = useTheme()
  const projects = useRequest(loadProjects, [])
  const [projectId, setProjectId] = useState<string>()
  const project = projects.data?.find((item) => item.projectId === projectId) ?? projects.data?.[0]
  const threads = useRequest(
    () => (project ? loadThreads(project.projectId) : Promise.resolve([])),
    [project?.projectId],
  )
  const machines = useComputers()

  // Coming back from a conversation shows its new title and time.
  const reloadThreads = useRef(threads.reload)
  reloadThreads.current = threads.reload
  const focused = useRef(false)
  useFocusEffect(
    useCallback(() => {
      if (focused.current) reloadThreads.current()
      focused.current = true
    }, []),
  )

  // On a wide window a conversation started beside the list is not in it yet.
  const lookedFor = useRef<string>(undefined)
  const selectedThread = selected?.kind === 'theorem' ? selected.threadId : undefined
  useEffect(() => {
    if (!selectedThread || threads.status !== 'ready' || lookedFor.current === selectedThread) return
    if (threads.data.some((thread) => thread.threadId === selectedThread)) return
    lookedFor.current = selectedThread
    threads.reload()
  }, [selectedThread, threads])

  const refresh = () => {
    projects.reload()
    threads.reload()
    void refreshComputers()
  }

  if (projects.status === 'failed' && !projects.data)
    return (
      <View style={styles.message}>
        <Text tone="error">{describeError(projects.error)}</Text>
        <Button label="Try again" onPress={projects.reload} />
      </View>
    )

  const theoremItems: Item[] = threads.data?.length
    ? threads.data.map((thread) => ({ kind: 'thread', key: thread.threadId, thread }))
    : [
        threads.status === 'failed'
          ? {
              kind: 'message',
              key: 'threads-failed',
              tone: 'error',
              text: describeError(threads.error),
              action: { label: 'Try again', onPress: threads.reload },
            }
          : {
              kind: 'message',
              key: 'threads-empty',
              tone: 'muted',
              text:
                threads.status === 'loading' || projects.status === 'loading'
                  ? 'Loading conversations…'
                  : `No conversations in ${project?.title ?? 'this project'} yet.`,
            },
      ]

  const sections: Section[] = [
    {
      key: 'theorem',
      // With several projects the chips above name the one shown.
      title: project && projects.data?.length === 1 ? `Theorem · ${project.title}` : 'Theorem',
      data: theoremItems,
    },
  ]

  if (machines.status === 'failed' && machines.entries.length === 0)
    sections.push({
      key: 'computers',
      title: 'Computers',
      data: [
        {
          kind: 'message',
          key: 'computers-failed',
          tone: 'error',
          text: `Could not list the computers saved on this device: ${describeError(machines.error)}`,
          action: { label: 'Try again', onPress: () => void refreshComputers() },
        },
      ],
    })

  if (machines.status !== 'unavailable')
    for (const entry of machines.entries) {
      const { computer } = entry
      const items: Item[] = entry.conversations.map((conversation) => ({
        kind: 'agent',
        key: `${computer.id}:${conversation.path}`,
        conversation,
      }))
      if (entry.status === 'failed')
        items.unshift({
          kind: 'message',
          key: `${computer.id}:failed`,
          tone: 'error',
          text: `Could not reach ${computer.name}: ${describeError(entry.error)}`,
          action: { label: 'Try again', onPress: () => void refreshComputers() },
        })
      else if (entry.status === 'ready' && !entry.tmux)
        items.unshift({
          kind: 'message',
          key: `${computer.id}:tmux`,
          tone: 'muted',
          text: `${computer.name} has no tmux, so Theorem can read these conversations but not continue them.`,
        })
      if (items.length === 0)
        items.push({
          kind: 'message',
          key: `${computer.id}:empty`,
          tone: 'muted',
          text:
            entry.status === 'loading'
              ? `Checking ${computer.name}…`
              : 'No Claude Code or Codex conversations from the last two weeks.',
        })
      sections.push({ key: computer.id, title: computer.name, checking: entry.status === 'loading', data: items })
    }

  const header = (
    <View style={styles.header}>
      <Button
        label="New conversation"
        variant="primary"
        accessibilityHint="Choose Theorem, Claude Code or Codex in the composer"
        onPress={() => onOpen({ kind: 'new' })}
      />
      {projects.data && projects.data.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.projects}>
          {projects.data.map((item) => {
            const active = item.projectId === project?.projectId
            return (
              <Pressable
                key={item.projectId}
                accessibilityRole="button"
                accessibilityState={{ selected: active }}
                accessibilityLabel={`Show conversations in ${item.title}`}
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
    </View>
  )

  return (
    <SectionList<Item, Section>
      sections={sections}
      keyExtractor={(item) => item.key}
      contentInsetAdjustmentBehavior="automatic"
      stickySectionHeadersEnabled={false}
      ListHeaderComponent={header}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={(threads.status === 'loading' && !!threads.data) || machines.status === 'loading'}
          onRefresh={refresh}
        />
      }
      renderSectionHeader={({ section }) => (
        <View style={styles.sectionHead}>
          <Text variant="label" tone="muted" accessibilityRole="header" numberOfLines={1} style={styles.sectionTitle}>
            {section.title.toUpperCase()}
          </Text>
          {section.checking ? <StatusLabel tone="live" label="Checking" /> : null}
        </View>
      )}
      renderItem={({ item }) => {
        switch (item.kind) {
          case 'thread':
            return (
              <Row
                title={threadTitle(item.thread)}
                detail={threadDetail(item.thread)}
                selected={sameSelection(selected, { kind: 'theorem', threadId: item.thread.threadId })}
                onPress={() => onOpen({ kind: 'theorem', threadId: item.thread.threadId })}
              />
            )
          case 'agent': {
            const { conversation } = item
            const target: Selection = {
              kind: 'agent',
              computerId: conversation.computerId,
              agent: conversation.agent,
              path: conversation.path,
            }
            return (
              <Row
                title={conversationTitle(conversation)}
                detail={conversationDetail(conversation)}
                selected={sameSelection(selected, target)}
                trailing={
                  conversation.liveness.kind === 'live' ? (
                    <StatusLabel tone="live" label="Running" />
                  ) : conversation.liveness.kind === 'ambiguous' ? (
                    <StatusLabel tone="attention" label="Read only" />
                  ) : undefined
                }
                onPress={() => onOpen(target)}
              />
            )
          }
          case 'message':
            return (
              <View style={styles.note}>
                <Text variant="label" tone={item.tone} accessibilityRole={item.tone === 'error' ? 'alert' : undefined}>
                  {item.text}
                </Text>
                {item.action ? <Button label={item.action.label} onPress={item.action.onPress} /> : null}
              </View>
            )
        }
      }}
    />
  )
}

const styles = StyleSheet.create({
  content: { paddingBottom: space.xl },
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
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  sectionTitle: { flexShrink: 1 },
  note: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.sm, alignItems: 'flex-start' },
  message: { padding: space.xl, gap: space.md, alignItems: 'center' },
})
