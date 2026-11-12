// SOURCING: Expo Modules API; the ptts Swift package v0.7.0 (MIT OR Apache-2.0) vendored into this pod by scripts/fetch-phonon.sh, its PhononCore.xcframework beside it, and the Core ML Models folder exported with the owner's voice and duration_delta -0.05 fixed at export (docs/plans/theo-sound.md, "Direction, and what the engine can carry"). The package guide asks that the loaded model and the player live as properties of something that stays alive, not as locals of one call, so they live here.
import ExpoModulesCore

public class TheoSpeechModule: Module {
  private var tts: Phonon?
  private var player: PhononPlayer?
  private var saying: Task<Void, Error>?

  public func definition() -> ModuleDefinition {
    Name("TheoSpeech")

    Function("support") { () -> [String: String] in
      if Bundle.main.url(forResource: "Models", withExtension: nil) != nil {
        return ["route": "phonon", "reason": ""]
      }
      return ["route": "none", "reason": "This build does not include Theo's voice model."]
    }

    AsyncFunction("speak") { (text: String) in
      try await self.speak(text)
    }

    Function("stop") {
      self.stop()
    }
  }

  private func speak(_ text: String) async throws {
    if tts == nil {
      guard let bundled = Bundle.main.url(forResource: "Models", withExtension: nil) else {
        throw PhononError(description: "This build does not include Theo's voice model.")
      }
      let models = try PhononModels.install(bundled: bundled)
      tts = try await Phonon.load(models: models, language: .english)
      player = try PhononPlayer()
    }
    guard let tts, let player else {
      throw PhononError(description: "Theo's voice could not start.")
    }
    stop()
    let task = Task { try await player.play(tts.stream(text)) }
    saying = task
    do {
      try await task.value
    } catch is CancellationError {
      // Stopped by an explicit stop: the saying ends, it does not fail.
    }
  }

  private func stop() {
    saying?.cancel()
    saying = nil
    player?.stop()
  }
}
