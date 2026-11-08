// SOURCING: ExpoModulesCore Module DSL (Name, Constant, View, Events); GhosttyKit ghostty_info() build mode, as Remux's RemuxApp.swift checks it
import ExpoModulesCore
import GhosttyKit

/// The session feature as React Native sees it: provenance constants and one native view.
/// Terminal bytes, rendering and input stay inside the native view.
public final class TheoremSessionModule: Module {
  public func definition() -> ModuleDefinition {
    Name("TheoremSession")

    Constant("remuxRevision") { RemuxProvenance.revision }
    Constant("ghosttyKitRelease") { RemuxProvenance.ghosttyKitRelease }
    Constant("ghosttyBuildMode") { GhosttyBuild.modeName }
    /// Nil when this build may host sessions; otherwise why it may not.
    Constant("unavailableReason") { GhosttyBuild.releaseValidationFailure ?? "" }

    View(TheoremSessionView.self) {
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
