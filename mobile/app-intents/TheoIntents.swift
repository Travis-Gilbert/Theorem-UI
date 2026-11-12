// SOURCING: Apple App Intents (AppIntent, @Parameter, openAppWhenRun) and expo-app-intents' AppIntentDispatcher, which queues the invocation for JavaScript (features/invocation/handler.tsx) whether or not the app was running
import AppIntents
internal import ExpoAppIntents

// Each intent opens the app and names what was asked. The app does the work
// with the services its own screens use. None of them reports an outcome
// here, because the outcome is not known until the app has done it.
//
// `openAppWhenRun` is the iOS 16 to 25 spelling; iOS 26 prefers
// `supportedModes`. With an iOS 18 deployment target the older one is the one
// that works everywhere this app runs.

/// Opens the camera for a new item, then the screen that sends it to a conversation.
struct CaptureForConversationIntent: AppIntent {
  static let title: LocalizedStringResource = "Capture for a Conversation"
  static let description = IntentDescription(
    "Photograph something and give it to a Theorem conversation that already exists."
  )
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await AppIntentDispatcher.shared.dispatch(name: "captureForConversation")
    return .result()
  }
}

/// Opens the sharing screen, with a note already written when one is given.
struct ShareIntoConversationIntent: AppIntent {
  static let title: LocalizedStringResource = "Share into a Conversation"
  static let description = IntentDescription(
    "Open Theorem ready to send a note, photo or file to a conversation that already exists."
  )
  static let openAppWhenRun: Bool = true

  @Parameter(title: "Note", description: "What you want done with what you share.")
  var note: String?

  @MainActor
  func perform() async throws -> some IntentResult {
    var params: [String: AppIntentValue] = [:]
    if let note, !note.isEmpty { params["note"] = .string(note) }
    await AppIntentDispatcher.shared.dispatch(name: "shareIntoConversation", params: params)
    return .result()
  }
}

/// Opens the conversation the person last had open on this phone.
struct ContinueConversationIntent: AppIntent {
  static let title: LocalizedStringResource = "Continue the Conversation"
  static let description = IntentDescription("Open the Theorem conversation you last had open on this iPhone.")
  static let openAppWhenRun: Bool = true

  @MainActor
  func perform() async throws -> some IntentResult {
    await AppIntentDispatcher.shared.dispatch(name: "continueConversation")
    return .result()
  }
}
