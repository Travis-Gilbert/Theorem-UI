// SOURCING: Apple's "Capturing screen content on iOS" sample and the ScreenCaptureKit reference as read on 2026-11-12 (iOS 27.0: SCContentSharingPicker.shared with present() for the whole display, SCContentSharingPickerConfiguration.showsMicrophoneControl, SCContentSharingPickerObserver, SCContentFilter.isMicrophoneEnabled, SCStream with .screen and .microphone outputs, an AVAudioSession in playAndRecord before a full-display capture). Never compiled: there was no Xcode where this was written.
#if canImport(ScreenCaptureKit)
import AVFoundation
import CoreMedia
import ScreenCaptureKit

/// The iOS 27 route: the system picker, then an SCStream that keeps running
/// while the person uses other apps (with the `screen-capture` background mode).
@available(iOS 27.0, *)
final class ScreenCaptureKitRoute: NSObject, CaptureRoute, SCContentSharingPickerObserver, SCStreamDelegate,
  SCStreamOutput
{
  static let name = "screencapturekit"

  private let picker = SCContentSharingPicker.shared
  private let samples = DispatchQueue(label: "rs.theorem.capture.samples")
  private weak var sink: CaptureSink?
  private var stream: SCStream?
  private var microphone = false

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
    do {
      if microphone {
        // Apple's sample: without an active playAndRecord session the microphone stops producing samples in the background.
        let audio = AVAudioSession.sharedInstance()
        try audio.setCategory(.playAndRecord, mode: .default, options: [.mixWithOthers, .defaultToSpeaker])
        try audio.setActive(true)
      }
      let configuration = SCStreamConfiguration()
      // A frame a second is enough to follow what someone is doing, and keeps the phone cool.
      configuration.minimumFrameInterval = CMTime(value: 1, timescale: 1)
      let next = SCStream(filter: filter, configuration: configuration, delegate: self)
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
      sink?.captureDelivered(frame: frame, at: sampleBuffer.presentationTimeStamp)
    case .microphone:
      sink?.captureDeliveredMicrophone()
    default:
      break
    }
  }

  // MARK: SCStreamDelegate

  func stream(_ stream: SCStream, didStopWithError error: Error) {
    self.stream = nil
    // The system ended it: the person stopped sharing from the system's control, a call arrived, or it failed.
    sink?.captureChanged(to: .stopped, reason: error.localizedDescription, microphone: false)
  }
}
#endif
