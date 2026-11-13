// SOURCING: expo-router router.dismissTo and useLocalSearchParams; the list itself is ThreadList
//
// Every conversation, by project. Choosing one goes back to Chat with it open;
// the selection lives in Chat's params, the same as on a wide window.
import { router, useLocalSearchParams } from 'expo-router'
import { paramsOf, type Selection } from '@/features/chat/selection'
import { ThreadList } from '@/features/chat/thread-list'

export default function HistoryScreen() {
  const { project } = useLocalSearchParams<{ project?: string }>()
  const open = (selection: Selection) =>
    router.dismissTo({ pathname: '/chat', params: { ...paramsOf(selection), ...(project ? { project } : {}) } })
  return (
    <ThreadList
      selected={undefined}
      onOpen={open}
      projectId={project}
      onProject={(projectId) => router.setParams({ project: projectId })}
    />
  )
}
