// SOURCING: Remux internals compiled into this pod (vendor/remux/Sources): ApplicationStorage.remuxRoot, the stores RemuxAppDependencies.live() builds, RemuxAppDependencies.sshConfiguration(for:trustedHostStore:tailscaleSSHCheckChallengeBroker:traceFlowID:), RemuxSSHRootService.preparedRoot with RemuxSSHPreparedRoot.sshRoot / claim / cancelAndCleanup (the steps of Remux's private withClaimedSSHRoot), RemuxSSHExecSession.run, SSHAuthResolver, ConnectionProfileRepository, SSHCredentialStore, TrustedHostStore.trustHostKey, and RemuxRootModel.deleteServer's order for removing a server
import Foundation
import UIKit

/// The app's one Remux dependency graph. The headless bridge and the terminal view share its stores and
/// its SSH connection pool, so the computer added in Settings is the one the terminal opens, over the
/// same connection.
@MainActor
enum TheoremRemux {
  static let rootService = RemuxSSHRootService()

  static let dependencies: Result<RemuxAppDependencies, Error> = Result {
    // RemuxAppDependencies.live(), with this pool passed in so the bridge can reach it.
    let root = try ApplicationStorage.remuxRoot()
    let trustedHostStore = TrustedHostStore(rootURL: root)
    return RemuxAppDependencies(
      profileRepository: FileBackedConnectionProfileRepository(rootURL: root),
      settingsRepository: FileBackedTerminalSettingsRepository(
        rootURL: root,
        defaultZoomMultipaneWindows: UIDevice.current.userInterfaceIdiom == .phone
      ),
      shortcutRepository: FileBackedShortcutRepository(rootURL: root),
      credentialStore: KeychainSSHCredentialStore(),
      trustedHostStore: trustedHostStore,
      publicKeyInstaller: try SSHPublicKeyInstaller(trustedHostStore: trustedHostStore),
      herdrOwnedZoomStore: FileBackedHerdrOwnedZoomStore(rootURL: root),
      sshRootService: rootService
    )
  }

  static func bridge() throws -> TheoremComputerBridge {
    TheoremComputerBridge(dependencies: try dependencies.get(), rootService: rootService)
  }
}

enum TheoremComputerError: LocalizedError {
  case notFound
  case invalidInput(String)
  case noPendingHostKey
  case fingerprintMismatch

  var errorDescription: String? {
    switch self {
    case .notFound: "This computer is no longer saved on this device."
    case .invalidInput(let reason): reason
    case .noPendingHostKey: "There is no host key waiting for a decision. Connect again."
    case .fingerprintMismatch: "The host key changed while you were deciding. Connect again and check it."
    }
  }
}

/// A computer as React Native sees it. No credential leaves the Keychain through this type.
struct TheoremComputer: Sendable {
  let id: UUID
  let name: String
  let host: String
  let port: Int
  let username: String
  let auth: SSHAuthenticationKind

  var record: [String: Any] {
    ["id": id.uuidString, "name": name, "host": host, "port": port, "username": username, "auth": auth.rawValue]
  }
}

/// What a command or a connection check came back with. A host key Remux does not trust yet is an
/// answer for the person, not an error.
enum TheoremRunOutcome: Sendable {
  case done(RemuxSSHExecResult)
  case hostKey(SSHHostKeyTrustChallenge)

  var record: [String: Any] {
    switch self {
    case .done(let result):
      return [
        "kind": "done",
        "exitStatus": result.exitStatus,
        // Logs and tool output are UTF-8; anything else is replaced rather than dropped.
        "stdout": String(decoding: result.stdout, as: UTF8.self),
        "stderr": String(decoding: result.stderr, as: UTF8.self),
      ]
    case .hostKey(let challenge):
      return [
        "kind": "host-key",
        "challenge": [
          "kind": challenge.kind == .unknown ? "unknown" : "changed",
          "host": challenge.host,
          "keyType": challenge.receivedKeyType,
          "fingerprint": challenge.receivedKeyFingerprint ?? "",
        ],
      ]
    }
  }
}

/// Host keys waiting for the person's decision, by computer. Trusting one needs the fingerprint the
/// person was shown, so a key that changed in between is never trusted on an old answer.
actor PendingHostKeys {
  static let shared = PendingHostKeys()
  private var challenges: [UUID: SSHHostKeyTrustChallenge] = [:]

  func hold(_ challenge: SSHHostKeyTrustChallenge) { challenges[challenge.serverID] = challenge }

  func take(_ id: UUID, fingerprint: String) throws -> SSHHostKeyTrustChallenge {
    guard let challenge = challenges[id] else { throw TheoremComputerError.noPendingHostKey }
    guard challenge.receivedKeyFingerprint == fingerprint else { throw TheoremComputerError.fingerprintMismatch }
    challenges[id] = nil
    return challenge
  }
}

struct TheoremComputerBridge: Sendable {
  let dependencies: RemuxAppDependencies
  let rootService: RemuxSSHRootService

  func list() async throws -> [TheoremComputer] {
    let snapshot = try await dependencies.profileRepository.loadSnapshot()
    return snapshot.servers.map { server in
      TheoremComputer(
        id: server.id,
        name: server.displayName,
        host: server.host,
        port: server.port,
        username: server.username,
        auth: snapshot.identity(id: server.identityID)?.authenticationKind ?? .none
      )
    }
  }

  /// Checks the sign-in, then saves the computer, its identity and its credential (Keychain), as Remux
  /// saves a new server only after it verified access. Nothing is saved while a host key waits.
  func save(
    id: UUID,
    name: String,
    host: String,
    port: Int,
    username: String,
    credential: SSHCredential
  ) async throws -> TheoremRunOutcome {
    let host = host.trimmingCharacters(in: .whitespacesAndNewlines)
    let username = username.trimmingCharacters(in: .whitespacesAndNewlines)
    guard !host.isEmpty else { throw TheoremComputerError.invalidInput("Enter the computer's host name or address.") }
    guard !username.isEmpty else { throw TheoremComputerError.invalidInput("Enter the user name to sign in as.") }
    guard (1...65535).contains(port) else { throw TheoremComputerError.invalidInput("The port must be between 1 and 65535.") }

    let identity = SSHIdentity(
      name: "\(username)@\(host)",
      authenticationKind: credential.authenticationKind
    )
    let server = SavedServer(
      id: id,
      displayName: name.isEmpty ? host : name,
      host: host,
      port: port,
      username: username,
      identityID: identity.id
    )
    let auth: ResolvedSSHAuth
    switch credential {
    case .password(let password):
      auth = .password(username: username, password: password, identityID: identity.id, displayLabel: identity.name)
    case .privateKey(let key):
      auth = try .privateKey(username: username, credential: key, identityID: identity.id, displayLabel: identity.name)
    }
    let check = try await run(
      on: SessionTarget(server: server, workspace: Self.workspace(for: server), sshAuth: auth),
      script: "exit 0\n"
    )
    guard case .done(let result) = check else { return check }
    guard result.exitStatus == 0 else { throw SSHAccessVerificationError.commandFailed(status: result.exitStatus) }

    try await dependencies.credentialStore.saveCredential(credential, identityID: identity.id)
    do {
      try await dependencies.profileRepository.saveIdentity(identity)
      try await dependencies.profileRepository.saveServer(server)
    } catch {
      try? await dependencies.credentialStore.deleteCredential(identityID: identity.id)
      throw error
    }
    return check
  }

  /// RemuxRootModel.deleteServer's order: the server, its host key, then its sign-in when no other
  /// server shares it. Sessions on the computer are not touched.
  func remove(_ id: UUID) async throws {
    let before = try await dependencies.profileRepository.loadSnapshot()
    let identityID = before.servers.first { $0.id == id }?.identityID
    for workspace in before.workspaces where workspace.serverID == id {
      try await dependencies.profileRepository.deleteWorkspace(id: workspace.id)
    }
    try await dependencies.profileRepository.deleteServer(id: id)
    try dependencies.trustedHostStore.deleteIdentity(for: id)
    let after = try await dependencies.profileRepository.loadSnapshot()
    if let identityID, !after.servers.contains(where: { $0.identityID == identityID }) {
      try await dependencies.credentialStore.deleteCredential(identityID: identityID)
      try await dependencies.profileRepository.deleteIdentity(id: identityID)
    }
    dependencies.closeIdleSSHConnections(forServerID: id)
  }

  /// Runs `script` with `/bin/sh -s` on a saved computer.
  func run(_ id: UUID, script: String) async throws -> TheoremRunOutcome {
    let snapshot = try await dependencies.profileRepository.loadSnapshot()
    guard let server = snapshot.servers.first(where: { $0.id == id }) else { throw TheoremComputerError.notFound }
    let auth = try await SSHAuthResolver(credentialStore: dependencies.credentialStore).resolve(server: server, in: snapshot)
    return try await run(
      on: SessionTarget(server: server, workspace: Self.workspace(for: server), sshAuth: auth),
      script: script
    )
  }

  func trustHostKey(_ id: UUID, fingerprint: String) async throws {
    let challenge = try await PendingHostKeys.shared.take(id, fingerprint: fingerprint)
    try dependencies.trustedHostStore.trustHostKey(challenge)
  }

  /// The script goes on stdin, so the login shell parses only `exec /bin/sh -s`.
  private func run(on target: SessionTarget, script: String) async throws -> TheoremRunOutcome {
    let trace = RemuxTransportStartupTrace(flowID: nil)
    let configuration = RemuxAppDependencies.sshConfiguration(
      for: target,
      trustedHostStore: dependencies.trustedHostStore,
      tailscaleSSHCheckChallengeBroker: rootService.tailscaleSSHCheckChallengeBroker,
      traceFlowID: nil
    )
    let key = configuration.sshRootKey ?? RemuxSSHRootKey(target: target)
    let prepared = await rootService.preparedRoot(
      for: key,
      configuration: configuration.sshRootConfiguration,
      trace: trace
    )
    do {
      let sshRoot = try await prepared.sshRoot()
      let claimed = try await prepared.claim(sshRoot, trace: trace)
      let result = try await RemuxSSHExecSession.run(
        using: claimed,
        command: "exec /bin/sh -s",
        stdin: Data(script.utf8),
        trace: trace
      )
      await prepared.cancelAndCleanup()
      return .done(result)
    } catch TrustedHostStoreError.hostKeyTrustRequired(let challenge) {
      await prepared.cancelAndCleanup()
      await PendingHostKeys.shared.hold(challenge)
      return .hostKey(challenge)
    } catch {
      await prepared.cancelAndCleanup()
      throw error
    }
  }

  /// Exec names no session, but Remux's target type carries one.
  private static func workspace(for server: SavedServer) -> SavedWorkspace {
    SavedWorkspace(serverID: server.id, backend: .tmux, sessionName: "")
  }
}
