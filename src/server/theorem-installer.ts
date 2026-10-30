// SOURCING: none — serves `curl -fsSL https://theorem.rs/install | sh` from the public release mirror
//
// The Theorem source repository is private, so its release assets are not
// anonymous. Its release workflow mirrors each tag's archives, sha256.sum and
// install.sh to the public repository below. Each release carries the
// install.sh that matches its own archives, so this always serves the latest.
export const LATEST_INSTALLER_URL =
  'https://github.com/Travis-Gilbert/theorem-releases/releases/latest/download/install.sh'

const TEXT = 'text/plain; charset=utf-8'

// Served as text rather than redirected, so a browser shows the script that
// `| sh` would run instead of downloading an opaque release asset.
export async function serveInstaller(): Promise<Response> {
  const upstream = await fetch(LATEST_INSTALLER_URL, { redirect: 'follow' })
  if (!upstream.ok) {
    // `curl -f` exits non-zero and pipes nothing to sh.
    return new Response(
      `theorem installer unavailable: the release mirror answered ${upstream.status}\n`,
      {
        status: 502,
        headers: { 'content-type': TEXT, 'cache-control': 'no-store' },
      },
    )
  }
  return new Response(upstream.body, {
    headers: { 'content-type': TEXT, 'cache-control': 'public, max-age=300' },
  })
}
