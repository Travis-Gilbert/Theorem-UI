// SOURCING: expo-router native intent (`redirectSystemPath`) and expo-sharing's incoming-share URL (host `expo-sharing`), as the SDK 58 expo-sharing guide wires them
//
// The share extension opens the app with a URL that is not a route. It goes
// to intake, which reads what was shared. Every other link is left as it is.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    if (new URL(path).hostname === 'expo-sharing') return '/intake?from=share'
  } catch {
    // Not a URL: an ordinary in-app path.
  }
  return path
}
