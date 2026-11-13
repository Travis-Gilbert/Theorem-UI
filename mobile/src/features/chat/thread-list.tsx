// SOURCING: react-native SectionList with RefreshControl; expo-router useFocusEffect; chat.projects and chat.threads through ./threads; saved computers and their agent conversations through features/agents/computers
//
// Every conversation the person can open, by who it is with: Theorem's agent
// in a project, then Claude Code and Codex on each saved computer. One button
// starts a new conversation; the composer there chooses who receives it.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Pressable, RefreshControl, ScrollView, SectionList, StyleSheet, View } from 'react-native'
import { useFocusEffect } from 'expo-router'
import { describeError, type Theorem } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { fullTime, recency } from '@/lib/time'
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
import { loadProjects, loadThreads, threadActivityMs, threadDetails, threadState, threadTitle } from './threads'

/** Window width (points) from which the conversation sits beside the list. */
export const SPLIT_WIDTH = 768

type Item =
  | { kind: 'thread'; key: string; thread: Theorem.Thread }
  | { kind: 'agent'; key: string; conversation: AgentConversation }
  | { kind: 'message'; key: string; text: string; tone: 'muted' | 'error'; action?: { label: string; onPress: () => void } }
  | { kind: 'more'; key: string; busy: boolean; onPress: () => void }

type Section = { key: string; title: string; checking?: boolean; data: Item[] }

/** Pages past the first, loaded when asked for. `loaded` is false until one has been. */
type Older = {
  projectId?: string
  threads: Theorem.Thread[]
  cursor?: string
  loaded: boolean
  status: 'idle' | 'loading' | 'failed'
  error?: unknown
}

const noOlder = (projectId?: string): Older => ({ projectId, threads: [], loaded: false, status: 'idle' })

function conversationTitle(conversation: AgentConversation) {
  return conversation.title?.trim() || folderName(conversation.cwd) || agentName[conversation.agent]
}

function conversationDetail(conversation: AgentConversation) {
  return [agentName[conversation.agent], folderName(conversation.cwd)].filter(Boolean).join(' · ')
}

export function ThreadList({
  selected,
  onOpen,
  projectId: chosenProject,
  onProject,
}: {
  selected: Selection | undefined
  onOpen: (selection: Selection) => void
  /** The project shown, when the caller holds it (in the URL); otherwise the list does. */
  projectId?: string
  onProject?: (projectId: string) => void
}) {
  const { palette } = useTheme()
  const projects = useRequest(loadProjects, [])
  const [ownProject, setOwnProject] = useState<string>()
  const projectId = onProject ? chosenProject : ownProject
  const setProjectId = onProject ?? setOwnProject
  const project = projects.data?.find((item) => item.projectId === projectId) ?? projects.data?.[0]
  const threads = useRequest(
    () => (project ? loadThreads(project.projectId) : Promise.resolve({ items: [] })),
    [project?.projectId],
  )
  const [olderState, setOlder] = useState<Older>(noOlder)
  const older = olderState.projectId === project?.projectId ? olderState : noOlder(project?.projectId)
  const nextCursor = older.loaded ? older.cursor : threads.data?.nextCursor
  // While older pages are fetched again below, a thread that moved up shows once.
  const firstPage = threads.data?.items ?? []
  const seen = new Set(firstPage.map((thread) => thread.threadId))
  const allThreads = [...firstPage, ...older.threads.filter((thread) => !seen.has(thread.threadId))]
  const machines = useComputers()
  /** Counts fetches of older pages; only the latest one's result is kept. */
  const olderFetch = useRef(0)

  const loadOlder = async () => {
    if (!project || !nextCursor || older.status === 'loading') return
    const projectId = project.projectId
    const attempt = ++olderFetch.current
    setOlder({ ...older, status: 'loading', error: undefined })
    try {
      const page = await loadThreads(projectId, nextCursor)
      if (attempt !== olderFetch.current) return
      setOlder((current) =>
        current.projectId === projectId
          ? { projectId, threads: [...current.threads, ...page.items], cursor: page.nextCursor, loaded: true, status: 'idle' }
          : current,
      )
    } catch (error) {
      if (attempt !== olderFetch.current) return
      setOlder((current) => (current.projectId === projectId ? { ...current, status: 'failed', error } : current))
    }
  }

  // A new first page can push its last threads down, past where the older pages
  // in hand begin. Fetch those pages again from the new cursor, to the same
  // depth, and replace them together. If that fails, only the first page shows.
  const olderNow = useRef(older)
  olderNow.current = older
  const firstData = threads.status === 'ready' ? threads.data : undefined
  useEffect(() => {
    const current = olderNow.current
    const projectId = current.projectId
    if (!firstData || !projectId || !current.loaded) return
    const depth = current.threads.length
    const attempt = ++olderFetch.current
    setOlder({ ...current, status: 'loading', error: undefined })
    void (async () => {
      const again: Theorem.Thread[] = []
      let cursor = firstData.nextCursor
      try {
        while (cursor && again.length < depth) {
          const page = await loadThreads(projectId, cursor)
          again.push(...page.items)
          cursor = page.nextCursor
        }
        if (attempt === olderFetch.current) setOlder({ projectId, threads: again, cursor, loaded: true, status: 'idle' })
      } catch (error) {
        if (attempt === olderFetch.current) setOlder({ ...noOlder(projectId), status: 'failed', error })
      }
    })()
  }, [firstData])

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
    const listed = (thread: Theorem.Thread) => thread.threadId === selectedThread
    if (threads.data.items.some(listed) || olderState.threads.some(listed)) return
    lookedFor.current = selectedThread
    threads.reload()
  }, [selectedThread, threads, olderState.threads])

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

  const theoremItems: Item[] = allThreads.length
    ? allThreads.map((thread) => ({ kind: 'thread', key: thread.threadId, thread }))
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

  if (older.status === 'failed')
    theoremItems.push({
      kind: 'message',
      key: 'older-failed',
      tone: 'error',
      text: `Could not load older conversations: ${describeError(older.error)}`,
      action: { label: 'Try again', onPress: () => void loadOlder() },
    })
  else if (nextCursor && allThreads.length)
    theoremItems.push({ kind: 'more', key: 'older', busy: older.status === 'loading', onPress: () => void loadOlder() })

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
                prominence="regular"
                title={threadTitle(item.thread)}
                detail={threadState(item.thread) ? `${threadState(item.thread)!.symbol} ${threadState(item.thread)!.label}` : undefined}
                detailTone={threadState(item.thread)?.tone}
                meta={recency(threadActivityMs(item.thread))}
                accessibilityLabel={[
                  threadTitle(item.thread),
                  threadState(item.thread)?.label,
                  fullTime(threadActivityMs(item.thread)),
                ]
                  .filter(Boolean)
                  .join(', ')}
                accessibilityHint="Long press for details"
                onLongPress={() => Alert.alert(threadTitle(item.thread), threadDetails(item.thread, project?.title))}
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
                prominence="regular"
                title={conversationTitle(conversation)}
                detail={conversationDetail(conversation)}
                meta={recency(conversation.mtime * 1000)}
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
          case 'more':
            return (
              <View style={styles.note}>
                <Button label="Show older conversations" variant="quiet" busy={item.busy} onPress={item.onPress} />
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
