// SOURCING: ExpoModulesCore Module DSL (Name, Constant, AsyncFunction, View, Prop, Events, Exception); GhosttyKit ghostty_info() build mode, as Remux's RemuxApp.swift checks it
import ExpoModulesCore
import GhosttyKit

/// The session feature as React Native sees it. Headless by default: computers, and commands run on
/// them over Remux's SSH pool. The terminal view exists for the person who turned it on in Settings.
public final class TheoremSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TheoremSession")

    Constant("remuxRevision") { RemuxProvenance.revision }
    Constant("ghosttyKitRelease") { RemuxProvenance.ghosttyKitRelease }
    Constant("ghosttyBuildMode") { GhosttyBuild.modeName }
    /// Empty when this build may host terminal sessions; otherwise why it may not.
    Constant("unavailableReason") { GhosttyBuild.releaseValidationFailure ?? "" }

    AsyncFunction("listComputers") { () async throws -> [[String: Any]] in
      try await TheoremRemux.bridge().list().map(\.record)
    }

    /// The credential arrives once, goes to the Keychain, and is not returned or kept here.
    AsyncFunction("saveComputer") { (input: [String: Any]) async throws -> [String: Any] in
      guard let id = (input["id"] as? String).flatMap(UUID.init(uuidString:)) else {
        throw TheoremComputerError.invalidInput("The computer needs an id.")
      }
      let credential = input["credential"] as? [String: Any] ?? [:]
      let secret: SSHCredential
      switch credential["kind"] as? String {
      case "password":
        secret = .password(credential["password"] as? String ?? "")
      case "privateKey":
        let passphrase = (credential["passphrase"] as? String).flatMap { $0.isEmpty ? nil : $0 }
        secret = .privateKey(SSHPrivateKeyCredential(
          privateKeyPEM: credential["privateKey"] as? String ?? "",
          passphrase: passphrase
        ))
      default:
        throw TheoremComputerError.invalidInput("Choose a password or a private key.")
      }
      return try await TheoremRemux.bridge().save(
        id: id,
        name: input["name"] as? String ?? "",
        host: input["host"] as? String ?? "",
        port: input["port"] as? Int ?? 22,
        username: input["username"] as? String ?? "",
        credential: secret
      ).record
    }

    AsyncFunction("removeComputer") { (id: String) async throws in
      guard let uuid = UUID(uuidString: id) else { throw TheoremComputerError.notFound }
      try await TheoremRemux.bridge().remove(uuid)
    }

    AsyncFunction("run") { (id: String, script: String) async throws -> [String: Any] in
      guard let uuid = UUID(uuidString: id) else { throw TheoremComputerError.notFound }
      return try await TheoremRemux.bridge().run(uuid, script: script).record
    }

    AsyncFunction("trustHostKey") { (id: String, fingerprint: String) async throws in
      guard let uuid = UUID(uuidString: id) else { throw TheoremComputerError.notFound }
      try await TheoremRemux.bridge().trustHostKey(uuid, fingerprint: fingerprint)
    }

    View(TheoremTerminalView.self) {
      Prop("computerId") { (view: TheoremTerminalView, value: String) in
        view.computerID = UUID(uuidString: value)
      }
      Prop("session") { (view: TheoremTerminalView, value: String) in
        view.sessionName = value
      }
      Events("onSceneChange")
    }
  }
}

enum RemuxProvenance {
  /// h3nock/remux commit the sources under vendor/remux were copied from.
  static let revision = "3646b2fff2ffbfe75b05e2683481160a886b6a6e"
  /// h3nock/remux-ghostty release scripts/fetch-ghosttykit.sh installs.
  static let ghosttyKitRelease = "ghosttykit-20261104"
}

/// Remux refuses to run a release build on anything but a ReleaseFast GhosttyKit
/// (RemuxApp.swift fatalErrors). The vendored @main is not compiled here, so the
/// same rule is applied when the view is created, as a visible refusal instead of a crash.
enum GhosttyBuild {
  static var modeName: String {
    switch ghostty_info().build_mode {
    case GHOSTTY_BUILD_MODE_DEBUG: "Debug"
    case GHOSTTY_BUILD_MODE_RELEASE_SAFE: "ReleaseSafe"
    case GHOSTTY_BUILD_MODE_RELEASE_FAST: "ReleaseFast"
    case GHOSTTY_BUILD_MODE_RELEASE_SMALL: "ReleaseSmall"
    default: "unknown"
    }
  }

  static var releaseValidationFailure: String? {
    #if DEBUG
    return nil
    #else
    guard ghostty_info().build_mode != GHOSTTY_BUILD_MODE_RELEASE_FAST else { return nil }
    return "This build links a \(modeName) GhosttyKit; release builds need the pinned ReleaseFast GhosttyKit."
    #endif
  }
}
