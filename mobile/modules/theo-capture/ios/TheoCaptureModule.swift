// SOURCING: ExpoModulesCore Module DSL (Name, Events, Function, AsyncFunction, sendEvent); Core Image for the JPEG of a frame; AVSpeechSynthesizer for the spoken-output check
import AVFoundation
import CoreImage
import ExpoModulesCore

/// The screen-sharing prototype as React Native sees it. It reports what the
/// system did and counts what the system delivered; it measures nothing else.
/// A frame leaves this module only as a file the app asks to keep.
///
/// `@unchecked Sendable`, as expo-app-intents' own module is: the route and the
/// synthesizer are touched only on the main actor, and the counts and kept
/// files only under `lock`. Frames arrive on the route's sample queue.
public final class TheoCaptureModule: Module, CaptureSink, @unchecked Sendable {
  @MainActor private var route: CaptureRoute?
  private let context = CIContext()
  @MainActor private let speech = AVSpeechSynthesizer()
  private let lock = NSLock()
  private var frames = 0
  private var microphoneBuffers = 0
  private var lastFrameAt: Double = 0
  private var kept: [URL] = []

  public func definition() -> ModuleDefinition {
    Name("TheoCapture")
    Events("onState", "onFrame")

    Function("support") { CaptureSupport.describe() }

    /// Presents the system picker. Resolves once it is up, not once sharing starts: that arrives as `onState`.
    AsyncFunction("start") { (askForMicrophone: Bool) in
      try await self.start(askForMicrophone: askForMicrophone)
    }

    AsyncFunction("stop") {
      await self.stop()
    }

    /// What has been delivered since the last start. Counts only.
    Function("stats") { () -> [String: Any] in
      self.lock.lock()
      defer { self.lock.unlock() }
      return ["frames": self.frames, "microphoneBuffers": self.microphoneBuffers, "lastFrameAtMs": self.lastFrameAt]
    }

    /// Speaks a line through the phone, to check that speech still plays while the screen and microphone are shared.
    AsyncFunction("speak") { (text: String) in
      await self.speak(text)
    }
  }

  @MainActor
  private func start(askForMicrophone: Bool) async throws {
    guard let route = CaptureSupport.makeRoute() else {
      throw Exception(name: "ERR_CAPTURE_UNAVAILABLE", description: CaptureSupport.describe()["reason"] as? String ?? "")
    }
    reset()
    self.route = route
    try await route.start(askForMicrophone: askForMicrophone, sink: self)
  }

  @MainActor
  private func stop() async {
    await route?.stop()
    route = nil
  }

  @MainActor
  private func speak(_ text: String) {
    speech.speak(AVSpeechUtterance(string: text))
  }

  private func reset() {
    lock.lock()
    frames = 0
    microphoneBuffers = 0
    lastFrameAt = 0
    lock.unlock()
  }

  // MARK: CaptureSink

  func captureChanged(to state: CaptureState, reason: String?, microphone: Bool) {
    sendEvent("onState", ["state": state.rawValue, "reason": reason ?? "", "microphone": microphone])
  }

  func captureDeliveredMicrophone() {
    lock.lock()
    microphoneBuffers += 1
    lock.unlock()
  }

  func captureDelivered(frame: CVPixelBuffer, at time: CMTime) {
    let now = Date().timeIntervalSince1970 * 1000
    lock.lock()
    frames += 1
    let sequence = frames
    lastFrameAt = now
    lock.unlock()

    // A still the app can show and, if the person asks, hand to a conversation. Scaled so the long side is 1280.
    let image = CIImage(cvPixelBuffer: frame)
    let scale = min(1, 1280 / max(image.extent.width, image.extent.height))
    let scaled = image.transformed(by: CGAffineTransform(scaleX: scale, y: scale))
    guard
      let folder = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask).first?
        .appendingPathComponent("theo-capture", isDirectory: true),
      let space = CGColorSpace(name: CGColorSpace.sRGB),
      let jpeg = context.jpegRepresentation(of: scaled, colorSpace: space)
    else { return }
    try? FileManager.default.createDirectory(at: folder, withIntermediateDirectories: true)
    let file = folder.appendingPathComponent("frame-\(sequence).jpg")
    guard (try? jpeg.write(to: file, options: .atomic)) != nil else { return }

    // Only the newest few stills are kept; the screen is not being recorded.
    lock.lock()
    kept.append(file)
    let old = kept.count > 3 ? Array(kept.prefix(kept.count - 3)) : []
    kept.removeFirst(old.count)
    lock.unlock()
    for url in old { try? FileManager.default.removeItem(at: url) }

    sendEvent("onFrame", [
      "sequence": sequence,
      "uri": file.absoluteString,
      "width": Int(scaled.extent.width),
      "height": Int(scaled.extent.height),
      "capturedAtMs": now,
    ])
  }
}
