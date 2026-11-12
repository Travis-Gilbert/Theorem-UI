// SOURCING: Expo app config (expo-router, expo-build-properties for the iOS 18 floor, the local theorem-session module plugin)
import type { ConfigContext, ExpoConfig } from 'expo/config'

/**
 * The Theorem authority, OAuth client and callback are build inputs, not code:
 * a personal tester now, a production store later. Each falls back to the
 * personal deployment the web app on theorem.rs also uses.
 */
const authority = process.env.THEOREM_AUTHORITY ?? 'https://travis-theorem-personal.fly.dev'
const oauthClientId = process.env.THEOREM_OAUTH_CLIENT_ID ?? 'theorem-ios'
// Theorem refuses custom-scheme redirect URIs, so sign-in returns through a
// claimed HTTPS callback (ASWebAuthenticationSession, iOS 17.4+). The app
// must be associated with this host: see docs/sign-in.md.
const oauthRedirectUri = process.env.THEOREM_OAUTH_REDIRECT_URI ?? 'https://theorem.rs/auth/ios/callback'
const bundleIdentifier = process.env.THEOREM_IOS_BUNDLE_ID ?? 'rs.theorem.app'
// One App Group holds what the app and its extensions pass each other (shared
// items today). The share extension's identifier is the app's with a suffix.
const appGroup = process.env.THEOREM_IOS_APP_GROUP ?? `group.${bundleIdentifier}`
// The EAS project (@commonplaces/theorem). Override both for another Expo account.
const easOwner = process.env.EAS_OWNER ?? 'commonplaces'
const easProjectId = process.env.EAS_PROJECT_ID ?? '2e3a9e30-8c11-4b4d-8fdb-7802ffe23c92'

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'Theorem',
  slug: 'theorem',
  owner: easOwner,
  version: '0.1.0',
  scheme: 'theorem',
  orientation: 'default',
  icon: './assets/icon.png',
  userInterfaceStyle: 'automatic',
  backgroundColor: '#1c1d1e',
  ios: {
    bundleIdentifier,
    // One universal app: the iPad gets the sidebar layout, and narrow
    // multitasking windows collapse to the selected detail.
    supportsTablet: true,
    requireFullScreen: false,
    associatedDomains: [`webcredentials:${new URL(oauthRedirectUri).host}`],
    infoPlist: {
      // Standard TLS and SSH only, the same declaration Remux makes; review before App Store submission.
      ITSAppUsesNonExemptEncryption: false,
      // Remux-derived terminal sessions (modules/theorem-session): dictation into the
      // session composer, hosts on the local network, and iPad pointer and keyboard input.
      NSMicrophoneUsageDescription: 'Theorem uses the microphone when you dictate into a terminal session.',
      NSSpeechRecognitionUsageDescription:
        'Theorem turns what you dictate into a terminal session into text on this device.',
      NSLocalNetworkUsageDescription:
        'Theorem connects to computers on your network when you open a terminal session on them.',
      UIApplicationSupportsIndirectInputEvents: true,
    },
  },
  plugins: [
    'expo-router',
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        imageWidth: 160,
        resizeMode: 'contain',
        backgroundColor: '#f3f3f3',
        dark: { image: './assets/splash-icon.png', backgroundColor: '#1c1d1e' },
      },
    ],
    'expo-secure-store',
    'expo-sqlite',
    'expo-web-browser',
    'expo-font',
    [
      // Camera and Photos for intake. The photo picker runs out of process and
      // needs no library permission. Intake records no audio: the microphone
      // string stays the terminal's, which this plugin would otherwise replace.
      'expo-image-picker',
      {
        cameraPermission: 'Theorem uses the camera when you photograph something to give to a conversation.',
        photosPermission: false,
        microphonePermission: 'Theorem uses the microphone when you dictate into a terminal session.',
      },
    ],
    [
      // The share sheet: a share extension (`<bundle id>.ShareExtension`) that
      // hands the shared items to the app through the App Group and opens
      // intake. Receiving is experimental in expo-sharing (SDK 58).
      'expo-sharing',
      {
        ios: {
          enabled: true,
          appGroupId: appGroup,
          extensionBundleIdentifier: `${bundleIdentifier}.ShareExtension`,
          activationRule: {
            supportsText: true,
            supportsWebUrlWithMaxCount: 1,
            supportsImageWithMaxCount: 10,
            supportsFileWithMaxCount: 10,
          },
        },
      },
    ],
    [
      'expo-build-properties',
      // The Remux session feature and its GhosttyKit build target iOS 18.
      { ios: { deploymentTarget: '18.0' } },
    ],
    // Puts Remux's images in the app's asset catalog (see the plugin for why).
    './modules/theorem-session/app.plugin.js',
  ],
  experiments: { typedRoutes: true },
  extra: {
    theorem: { authority, oauthClientId, oauthRedirectUri },
    eas: { projectId: easProjectId },
  },
})
