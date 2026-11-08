// SOURCING: ExpoModulesCore ExpoView and EventDispatcher; SwiftUI UIHostingController; UIKit UIScene activation notifications; Remux RootView and RemuxAppDependencies.launch() (vendor/remux/Sources/App)
import ExpoModulesCore
import SwiftUI
import UIKit

/// Hosts Remux's session feature. Removing this view detaches the client: the
/// tmux or Herdr session keeps running on its host, as when Remux closes.
/// The scene observers end with the host (detachHost), not in deinit.
final class TheoremSessionView: ExpoView {
  let onSceneChange = EventDispatcher()

  private let scene = HostedScenePhase()
  private var host: UIHostingController<AnyView>?

  required init(appContext: AppContext? = nil) {
    super.init(appContext: appContext)
    clipsToBounds = true
  }

  override func didMoveToWindow() {
    super.didMoveToWindow()
    if window == nil {
      detachHost()
      return
    }
    scene.track(window?.windowScene) { [weak self] phase in
      self?.onSceneChange(["phase": phase.name])
    }
    attachHost()
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    host?.view.frame = bounds
  }

  private func attachHost() {
    guard host == nil else { return }
    let content: AnyView
    if let failure = GhosttyBuild.releaseValidationFailure {
      content = AnyView(Text(failure).padding())
    } else {
      content = AnyView(HostedRemux(scene: scene))
    }
    let controller = UIHostingController(rootView: content)
    controller.view.backgroundColor = .clear
    controller.view.frame = bounds
    controller.view.autoresizingMask = [.flexibleWidth, .flexibleHeight]
    // Sheets, keyboard handling and safe areas need a parent controller.
    let parent = nearestViewController()
    parent?.addChild(controller)
    addSubview(controller.view)
    controller.didMove(toParent: parent)
    host = controller
  }

  private func detachHost() {
    guard let controller = host else { return }
    controller.willMove(toParent: nil)
    controller.view.removeFromSuperview()
    controller.removeFromParent()
    host = nil
    scene.stop()
  }

  private func nearestViewController() -> UIViewController? {
    var responder: UIResponder? = self
    while let current = responder {
      if let controller = current as? UIViewController { return controller }
      responder = current.next
    }
    return nil
  }
}

/// Remux reacts to `scenePhase` (GhosttySurfaceScreen pauses and resumes surfaces).
/// SwiftUI only supplies it inside a SwiftUI App scene, so the hosting window's
/// UIScene activation state is passed in here.
private struct HostedRemux: View {
  @ObservedObject var scene: HostedScenePhase

  var body: some View {
    RootView().environment(\.scenePhase, scene.phase)
  }
}

@MainActor
final class HostedScenePhase: ObservableObject {
  @Published private(set) var phase: ScenePhase = .active
  private var observers: [NSObjectProtocol] = []

  func track(_ windowScene: UIWindowScene?, onChange: @escaping @MainActor (ScenePhase) -> Void) {
    stop()
    if let windowScene { set(Self.phase(of: windowScene.activationState), onChange) }
    let center = NotificationCenter.default
    let updates: [(Notification.Name, ScenePhase)] = [
      (UIScene.didActivateNotification, .active),
      (UIScene.willDeactivateNotification, .inactive),
      (UIScene.didEnterBackgroundNotification, .background),
      (UIScene.willEnterForegroundNotification, .inactive),
    ]
    observers = updates.map { name, phase in
      center.addObserver(forName: name, object: windowScene, queue: .main) { [weak self] _ in
        // Delivered on the main queue, as requested above.
        MainActor.assumeIsolated { self?.set(phase, onChange) }
      }
    }
  }

  func stop() {
    observers.forEach(NotificationCenter.default.removeObserver)
    observers = []
  }

  private func set(_ next: ScenePhase, _ onChange: @MainActor (ScenePhase) -> Void) {
    guard next != phase else { return }
    phase = next
    onChange(next)
  }

  private static func phase(of state: UIScene.ActivationState) -> ScenePhase {
    switch state {
    case .foregroundActive: .active
    case .foregroundInactive: .inactive
    default: .background
    }
  }
}

private extension ScenePhase {
  var name: String {
    switch self {
    case .active: "active"
    case .inactive: "inactive"
    case .background: "background"
    @unknown default: "unknown"
    }
  }
}
