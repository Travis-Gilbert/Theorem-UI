// SOURCING: none. The one interface every way of capturing the screen sits behind (docs/plans/theo-iphone.md §1: "keep the capture implementation behind a common interface").
import CoreMedia
import CoreVideo
import Foundation

/// What a capture session is doing. Each case is something that happened, not something hoped for.
enum CaptureState: String {
  /// Nothing is being captured.
  case idle
  /// The system's picker is up; the person has not chosen yet.
  case picking
  /// The system is delivering frames.
  case capturing
  /// The person or the system ended it.
  case stopped
  /// It could not start or it broke; `reason` says how.
  case failed
}

/// Where a route sends what it gets. Routes never touch React Native.
protocol CaptureSink: AnyObject {
  func captureChanged(to state: CaptureState, reason: String?, microphone: Bool)
  /// One screen frame as the system delivered it.
  func captureDelivered(frame: CVPixelBuffer, at time: CMTime)
  /// One buffer of microphone audio arrived. Only counted: nothing here measures loudness.
  func captureDeliveredMicrophone()
}

/// One way of capturing the whole display, started by the person through a system interface.
protocol CaptureRoute: AnyObject {
  /// Shown to the person and reported to JavaScript: "screencapturekit".
  static var name: String { get }
  /// Presents the system's own picker. Capture begins only if the person chooses to share.
  @MainActor func start(askForMicrophone: Bool, sink: CaptureSink) async throws
  @MainActor func stop() async
}

enum CaptureSupport {
  /// The route this build and this iOS can use, and otherwise why there is none.
  static func describe() -> [String: Any] {
    #if canImport(ScreenCaptureKit)
    if #available(iOS 27.0, *) {
      return ["route": ScreenCaptureKitRoute.name, "reason": ""]
    }
    return [
      "route": "none",
      "reason": "Sharing the whole screen from an app needs iOS 27. On earlier versions it needs a ReplayKit broadcast extension, which this build does not include.",
    ]
    #elseif targetEnvironment(simulator)
    return [
      "route": "none",
      "reason": "The iOS Simulator has no ScreenCaptureKit. Screen sharing needs an iPhone on iOS 27.",
    ]
    #else
    return [
      "route": "none",
      "reason": "This build was made with an iOS SDK older than 27, which has no ScreenCaptureKit for iPhone.",
    ]
    #endif
  }

  @MainActor static func makeRoute() -> CaptureRoute? {
    #if canImport(ScreenCaptureKit)
    if #available(iOS 27.0, *) { return ScreenCaptureKitRoute() }
    #endif
    return nil
  }
}
