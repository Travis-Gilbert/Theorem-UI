// SOURCING: expo-router NativeTabs (UITabBarController; sidebarAdaptable turns it into the iPad sidebar on iOS 18+)
import { NativeTabs } from 'expo-router/native-tabs'
import { useTheme } from '@/ui/theme'

export default function TabsLayout() {
  const { palette } = useTheme()
  return (
    <NativeTabs sidebarAdaptable tintColor={palette.accent}>
      <NativeTabs.Trigger name="chat">
        <NativeTabs.Trigger.Icon sf="bubble.left.and.bubble.right" />
        <NativeTabs.Trigger.Label>Chat</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox">
        <NativeTabs.Trigger.Icon sf="tray" />
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="library">
        <NativeTabs.Trigger.Icon sf="books.vertical" />
        <NativeTabs.Trigger.Label>Library</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="platinum">
        <NativeTabs.Trigger.Icon sf="desktopcomputer" />
        <NativeTabs.Trigger.Label>Computer</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  )
}
