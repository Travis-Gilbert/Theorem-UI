// SOURCING: Apple App Intents (AppShortcutsProvider, AppShortcut), as scaffolded by expo-app-intents 0.5 for SDK 58
import AppIntents

/// Theo's actions in Shortcuts, Spotlight, Siri and on the Action button
/// (docs/plans/theo-iphone.md §5). Each one opens the app at the same screen
/// the person would reach by hand and does its work there, so a shortcut is
/// never a second, weaker version of the app.
///
/// System rules: every phrase names the app, and an app has at most 10.
struct AppShortcuts: AppShortcutsProvider {
  static var appShortcuts: [AppShortcut] {
    AppShortcut(
      intent: CaptureForConversationIntent(),
      phrases: [
        "Capture something for \(.applicationName)",
        "Show \(.applicationName) what I'm looking at"
      ],
      shortTitle: "Capture for a conversation",
      systemImageName: "camera"
    )
    AppShortcut(
      intent: ShareIntoConversationIntent(),
      phrases: [
        "Give this to \(.applicationName)",
        "Share into a \(.applicationName) conversation"
      ],
      shortTitle: "Share into a conversation",
      systemImageName: "square.and.arrow.up"
    )
    AppShortcut(
      intent: ContinueConversationIntent(),
      phrases: [
        "Continue with \(.applicationName)",
        "Open my last \(.applicationName) conversation"
      ],
      shortTitle: "Continue the conversation",
      systemImageName: "bubble.left.and.text.bubble.right"
    )
  }
}
