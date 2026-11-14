// SOURCING: expo-router Redirect and the anchor (index) route that Stack.Protected falls back to (SDK 58 protected routes guide)
//
// A launch without a link opens `/`. This route is the root Stack's anchor, outside both
// guards: it sends a signed-in person to Chat and anyone else to sign-in. A protected route
// that is refused comes back here, so it decides from the account rather than redirecting
// to another protected route.
import { Redirect } from 'expo-router'
import { useAuth } from '@/lib/auth'

export default function Index() {
  return <Redirect href={useAuth().status === 'signed-in' ? '/chat' : '/sign-in'} />
}
