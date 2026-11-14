// SOURCING: expo-router useLocalSearchParams/router and Stack.Toolbar (native header items and menu); react-native useWindowDimensions for the iPad list+detail split
import { useEffect } from 'react'
import { StyleSheet, useWindowDimensions, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { AgentPane } from '@/features/agents/agent-pane'
import { ConversationPane } from '@/features/chat/conversation-pane'
import { NewConversation } from '@/features/chat/new-conversation'
import { paramsOf, selectionOf, type Selection, type SelectionParams } from '@/features/chat/selection'
import { SPLIT_WIDTH, ThreadList } from '@/features/chat/thread-list'
import { loadProjects, loadThreads, mostRecentThread } from '@/features/chat/threads'
import { describeError } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { Button } from '@/ui/button'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'

type Params = SelectionParams & { project?: string }

/**
 * Chat opens the conversation the person was last in: the most recent thread
 * of the chosen project, or a new conversation when the project has none. What
 * is open, and the project, live in the URL params, so a resize or a return to
 * the tab keeps them. History is its own screen; on a wide window the list
 * sits beside the conversation instead.
 */
export default function ChatScreen() {
  const params = useLocalSearchParams<Params>()
  const selected = selectionOf(params)
  const { width } = useWindowDimensions()
  const { palette } = useTheme()
  const wide = width >= SPLIT_WIDTH

  const projects = useRequest(loadProjects, [])
  const project = projects.data?.find((item) => item.projectId === params.project) ?? projects.data?.[0]
  const latest = useRequest(
    () => (project ? loadThreads(project.projectId) : Promise.resolve(undefined)),
    [project?.projectId],
  )
  const resumed = latest.data ? mostRecentThread(latest.data.items) : undefined

  // Nothing chosen yet: resume. The choice goes into the URL, so a conversation
  // that starts elsewhere later does not replace this one under the person.
  useEffect(() => {
    if (selected || !project || latest.status !== 'ready') return
    router.setParams(paramsOf(resumed ? { kind: 'theorem', threadId: resumed.threadId } : { kind: 'new' }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!selected, project?.projectId, latest.status, resumed?.threadId])

  const open = (selection: Selection) => router.setParams(paramsOf(selection))
  const close = () => router.setParams(paramsOf(undefined))
  // A different project starts from its own latest conversation.
  const chooseProject = (projectId: string) => router.setParams({ ...paramsOf(undefined), project: projectId })

  const failure = projects.status === 'failed' && !projects.data ? projects : latest.status === 'failed' && !selected ? latest : undefined

  const conversation = selected ? (
    selected.kind === 'theorem' ? (
      <ConversationPane key={selected.threadId} threadId={selected.threadId} titled={!wide} onLeave={close} />
    ) : selected.kind === 'agent' ? (
      <AgentPane
        key={`${selected.computerId}:${selected.path}`}
        target={{ computerId: selected.computerId, agent: selected.agent, path: selected.path }}
        titled={!wide}
      />
    ) : (
      <>
        {wide ? null : <Stack.Screen options={{ title: 'New conversation' }} />}
        <NewConversation onOpen={open} />
      </>
    )
  ) : failure ? (
    <View style={styles.placeholder}>
      <Text tone="error">{describeError(failure.error)}</Text>
      <Button
        label="Try again"
        onPress={() => {
          projects.reload()
          latest.reload()
        }}
      />
    </View>
  ) : (
    <View style={styles.placeholder}>
      <StatusLabel tone="live" label="Opening your conversation" />
    </View>
  )

  if (!wide)
    return (
      <View style={styles.fill}>
        <Stack.Toolbar placement="left">
          <Stack.Toolbar.Button
            icon="clock.arrow.circlepath"
            accessibilityLabel="Conversation history"
            onPress={() =>
              router.push({ pathname: '/chat/history', params: project ? { project: project.projectId } : {} })
            }
          />
          {project && projects.data ? (
            <Stack.Toolbar.Menu accessibilityLabel={`Project: ${project.title}. Change project`}>
              <Stack.Toolbar.Label>{project.title}</Stack.Toolbar.Label>
              {projects.data.map((item) => (
                <Stack.Toolbar.MenuAction
                  key={item.projectId}
                  isOn={item.projectId === project.projectId}
                  onPress={() => chooseProject(item.projectId)}
                >
                  {item.title}
                </Stack.Toolbar.MenuAction>
              ))}
              <Stack.Toolbar.MenuAction
                icon="folder"
                onPress={() => router.push({ pathname: '/chat/project', params: { project: project.projectId } })}
              >
                Project page
              </Stack.Toolbar.MenuAction>
              <Stack.Toolbar.MenuAction icon="square.and.pencil" onPress={() => open({ kind: 'new' })}>
                New conversation
              </Stack.Toolbar.MenuAction>
            </Stack.Toolbar.Menu>
          ) : null}
        </Stack.Toolbar>
        {conversation}
      </View>
    )

  return (
    <View style={styles.split}>
      <View style={[styles.list, { borderRightColor: palette.lineSeparator }]}>
        <ThreadList selected={selected} onOpen={open} projectId={project?.projectId} onProject={chooseProject} />
      </View>
      <View style={styles.detail}>{selected ? conversation : (
        <View style={styles.placeholder}>
          <Text tone="muted">Choose a conversation, or start a new one.</Text>
        </View>
      )}</View>
    </View>
  )
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  split: { flex: 1, flexDirection: 'row' },
  list: { width: 340, borderRightWidth: StyleSheet.hairlineWidth },
  detail: { flex: 1 },
  placeholder: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12 },
})
