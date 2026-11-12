// SOURCING: Apple's "Capturing screen content on iOS" sample and the ScreenCaptureKit reference as read on 2026-11-12 (iOS 27.0: SCContentSharingPicker.shared with present() for the whole display, SCContentSharingPickerConfiguration.showsMicrophoneControl, SCContentSharingPickerObserver, SCContentFilter.isMicrophoneEnabled, SCStream with .screen and .microphone outputs, an AVAudioSession in playAndRecord before a full-display capture). Compiled against the iPhoneOS 27.1 SDK on EAS; that SDK marks SCStreamConfiguration.minimumFrameInterval unavailable on iOS.
#if canImport(ScreenCaptureKit)
import AVFoundation
import CoreMedia
import ScreenCaptureKit

/// The iOS 27 route: the system picker, then an SCStream that keeps running
/// while the person uses other apps (with the `screen-capture` background mode).
///
/// `@unchecked Sendable`, as the capture module is: the picker, `stream` and
/// `microphone` are touched only on the main actor, `lastFrame` only on
/// `samples`, and `sink` is set on the main actor before any stream exists.
/// The system calls the observer and delegate methods on threads of its own,
/// so they hop to the main actor before touching that state.
@available(iOS 27.0, *)
final class ScreenCaptureKitRoute: NSObject, CaptureRoute, SCContentSharingPickerObserver, SCStreamDelegate,
  SCStreamOutput, @unchecked Sendable
{
  static let name = "screencapturekit"

  private let picker = SCContentSharingPicker.shared
  private let samples = DispatchQueue(label: "rs.theorem.capture.samples")
  private weak var sink: CaptureSink?
  @MainActor private var stream: SCStream?
  @MainActor private var microphone = false
  /// Touched only on `samples`, where the system calls the stream output.
  private var lastFrame = CMTime.invalid

  @MainActor
  func start(askForMicrophone: Bool, sink: CaptureSink) async throws {
    self.sink = sink
    var configuration = SCContentSharingPickerConfiguration()
    configuration.showsMicrophoneControl = askForMicrophone
    picker.defaultConfiguration = configuration
    picker.add(self)
    picker.isActive = true
    sink.captureChanged(to: .picking, reason: nil, microphone: false)
    // The whole display. The person chooses, in the system's interface, whether to share and whether to include the microphone.
    picker.present()
  }

  @MainActor
  func stop() async {
    picker.remove(self)
    picker.isActive = false
    let running = stream
    stream = nil
    try? await running?.stopCapture()
    try? AVAudioSession.sharedInstance().setActive(false, options: .notifyOthersOnDeactivation)
    sink?.captureChanged(to: .stopped, reason: "You stopped sharing.", microphone: false)
  }

  // MARK: SCContentSharingPickerObserver

  func contentSharingPicker(_ picker: SCContentSharingPicker, didUpdateWith filter: SCContentFilter, for stream: SCStream?) {
    // The filter describes what the person chose; the system does not change it after handing it over.
    nonisolated(unsafe) let filter = filter
    Task { @MainActor in await self.begin(with: filter) }
  }

  func contentSharingPicker(_ picker: SCContentSharingPicker, didCancelFor stream: SCStream?) {
    sink?.captureChanged(to: .stopped, reason: "You closed the picker without sharing.", microphone: false)
  }

  func contentSharingPickerStartDidFailWithError(_ error: Error) {
    sink?.captureChanged(to: .failed, reason: error.localizedDescription, microphone: false)
  }

  @MainActor
  private func begin(with filter: SCContentFilter) async {
    try? await stream?.stopCapture()
    microphone = filter.isMicrophoneEnabled
    samples.sync { lastFrame = .invalid }
    do {
      if microphone {
        // Apple's sample: without an active playAndRecord session the microphone stops producing samples in the background.
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
        try audio.setActive(true)
      }
      let next = SCStream(filter: filter, configuration: SCStreamConfiguration(), delegate: self)
      try next.addStreamOutput(self, type: .screen, sampleHandlerQueue: samples)
      if microphone {
        try next.addStreamOutput(self, type: .microphone, sampleHandlerQueue: samples)
      }
      try await next.startCapture()
      stream = next
      sink?.captureChanged(to: .capturing, reason: nil, microphone: microphone)
    } catch {
      stream = nil
      sink?.captureChanged(to: .failed, reason: error.localizedDescription, microphone: false)
    }
  }

  // MARK: SCStreamOutput

  func stream(_ stream: SCStream, didOutputSampleBuffer sampleBuffer: CMSampleBuffer, of type: SCStreamOutputType) {
    guard sampleBuffer.isValid else { return }
    switch type {
    case .screen:
      guard let frame = sampleBuffer.imageBuffer else { return }
      // A frame a second is enough to follow what someone is doing, and keeps the phone cool. iOS has no
      // minimumFrameInterval, so the route passes on at most one frame a second of presentation time.
      let time = sampleBuffer.presentationTimeStamp
      if lastFrame.isValid, CMTimeGetSeconds(CMTimeSubtract(time, lastFrame)) < 1 { return }
      lastFrame = time
      sink?.captureDelivered(frame: frame, at: time)
    case .microphone:
      sink?.captureDeliveredMicrophone()
    default:
      break
    }
  }

  // MARK: SCStreamDelegate

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    let stopped = ObjectIdentifier(stream)
    Task { @MainActor in
      if let current = self.stream, ObjectIdentifier(current) == stopped { self.stream = nil }
    }
    // The system ended it: the person stopped sharing from the system's control, a call arrived, or it failed.
    sink?.captureChanged(to: .stopped, reason: error.localizedDescription, microphone: false)
  }
}
#endif
