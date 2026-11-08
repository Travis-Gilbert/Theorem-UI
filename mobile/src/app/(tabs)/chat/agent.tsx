// SOURCING: expo-router useLocalSearchParams; the conversation itself is AgentPane
//
// A Claude Code or Codex conversation on a computer, pushed on a narrow window.
import { useEffect } from 'react'
import { useWindowDimensions } from 'react-native'
import { router, useLocalSearchParams } from 'expo-router'
import { AgentPane } from '@/features/agents/agent-pane'
import { paramsOf, selectionOf, type SelectionParams } from '@/features/chat/selection'
import { SPLIT_WIDTH } from '@/features/chat/thread-list'
import { Screen } from '@/ui/screen'
import { Unavailable } from '@/ui/unavailable'

export default function AgentScreen() {
  const params = useLocalSearchParams<Pick<SelectionParams, 'computer' | 'agent' | 'log'>>()
  const selection = selectionOf({ computer: params.computer, agent: params.agent, log: params.log })
  const { width } = useWindowDimensions()
  const wide = width >= SPLIT_WIDTH

  useEffect(() => {
    if (wide && selection) router.replace({ pathname: '/chat', params: paramsOf(selection) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wide, params.computer, params.agent, params.log])

  if (selection?.kind !== 'agent')
    return (
      <Screen scroll>
        <Unavailable
          title="This link does not name a conversation"
          reason="A Claude Code or Codex conversation needs its computer, its agent and the path of its log."
        />
      </Screen>
    )
  return (
    <AgentPane
      key={`${selection.computerId}:${selection.path}`}
      target={{ computerId: selection.computerId, agent: selection.agent, path: selection.path }}
      titled
    />
  )
}
