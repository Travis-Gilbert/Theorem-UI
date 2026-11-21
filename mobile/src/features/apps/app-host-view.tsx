// SOURCING: react-native-webview (onMessage from the page's window.ReactNativeWebView, injectJavaScript in, onOpenWindow, onShouldStartLoadWithRequest); @theoremharness/sdk documents.get / snapshot / revise and its parseJson / stringifyJson (bigint-safe); the App host page is Theorem-UI src/routes/app-host.tsx
//
// The web's App host in a WebView. Apps run there as the web runs them: the
// page builds each App and frames it on an origin of its own. The page has no
// session, so the Theorem calls it needs are made here, as the person this
// app signed in. Only the host page itself may ask: an App's frame posts from
// its own address and is not listened to.
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import type { StyleProp, ViewStyle } from 'react-native'
import { WebView, type WebViewMessageEvent } from 'react-native-webview'
import { parseJson, stringifyJson } from '@theoremharness/sdk'
import { openInBrowser } from '@/features/browser/store'
import { config } from '@/lib/config'
import { mutate, statusOf, theorem } from '@/lib/theorem'
import { deliverScript, readFromHost, type FromHost, type HostMethod, type ToHost } from './protocol'

const WEB = /^https?:/i

/** How long the host page has to load and say `ready` before it is reported missing. */
const HOST_STARTUP_MS = 30_000

type Args = Record<string, unknown>

/** One call the page asked for, made with this app's credentials. A revise keeps the page's idempotency key. */
async function callTheorem(method: HostMethod, args: Args): Promise<unknown> {
  const documents = theorem().documents
  switch (method) {
    case 'documents.get':
      return documents.get(args as never)
    case 'documents.snapshot':
      return documents.snapshot(args as never)
    case 'documents.revise': {
      const { 'X-CSRF-Token': _csrf, 'Idempotency-Key': key, ...request } = args
      if (typeof key !== 'string' || !key) throw new Error('A revise needs an idempotency key.')
      return mutate(key, (headers) =>
        documents.revise({ ...(request as unknown as Parameters<typeof documents.revise>[0]), ...headers }),
      )
    }
  }
}

async function reply(method: HostMethod, id: string, args: string): Promise<ToHost> {
  try {
    const value = await callTheorem(method, parseJson<Args>(args))
    return { type: 'reply', id, ok: true, value: stringifyJson(value ?? null) }
  } catch (error) {
    const body = (error as { body?: unknown })?.body
    return {
      type: 'reply',
      id,
      ok: false,
      status: statusOf(error),
      // The body crosses as JSON; a wire integer beyond the safe range becomes text first.
      body: body === undefined ? undefined : JSON.parse(stringifyJson(body)),
      message: error instanceof Error ? error.message : String(error),
    }
  }
}

export type AppHostHandle = { send: (message: ToHost) => void }

export const AppHostView = forwardRef<
  AppHostHandle,
  {
    onHostMessage: (message: Exclude<FromHost, { type: 'call' }>) => void
    /** The host could not load or start. Named so the screen can say what is missing. */
    onHostError?: (reason: string) => void
    style?: StyleProp<ViewStyle>
    scrollEnabled?: boolean
  }
>(function AppHostView({ onHostMessage, onHostError, style, scrollEnabled = false }, ref) {
  // react-native-webview 14 declares `WebView<P = undefined>`; browser-host.tsx explains the `{}`.
  const view = useRef<WebView<{}>>(null)
  const send = (message: ToHost) => view.current?.injectJavaScript(deliverScript(stringifyJson(message)))
  useImperativeHandle(ref, () => ({ send }))

  // A terminal load failure, or a host that never starts, is reported once so
  // pending checks settle instead of waiting forever for a `ready` that never comes.
  const started = useRef(false)
  const failed = useRef(false)
  const fail = (reason: string) => {
    if (started.current || failed.current) return
    failed.current = true
    onHostError?.(reason)
  }
  useEffect(() => {
    const timer = setTimeout(() => fail('The App host did not start in time.'), HOST_STARTUP_MS)
    return () => clearTimeout(timer)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const onMessage = (event: WebViewMessageEvent) => {
    if (event.nativeEvent.url.split('#')[0] !== config.appHost) return
    const message = readFromHost(event.nativeEvent.data)
    if (!message) return
    if (message.type === 'ready') started.current = true
    if (message.type === 'call') void reply(message.method, message.id, message.args).then(send)
    else onHostMessage(message)
  }

  return (
    <WebView<{}>
      ref={view}
      source={{ uri: config.appHost }}
      style={[{ backgroundColor: 'transparent' }, style]}
      originWhitelist={['http://*', 'https://*', 'about:*', 'blob:*', 'data:*']}
      onMessage={onMessage}
      onError={(event) => fail(`The App host could not load: ${event.nativeEvent.description}`)}
      onHttpError={(event) => {
        // Only the host page's own failure is terminal; an App frame's resources may 404.
        if (event.nativeEvent.url.split('#')[0] === config.appHost && event.nativeEvent.statusCode >= 400)
          fail(`The App host answered ${event.nativeEvent.statusCode}.`)
      }}
      // The page stays the host page; an App's own frame may go where it likes.
      onShouldStartLoadWithRequest={(request) =>
        request.isTopFrame === false || request.url.split('#')[0] === config.appHost
      }
      onOpenWindow={(event) => {
        if (WEB.test(event.nativeEvent.targetUrl)) openInBrowser(event.nativeEvent.targetUrl)
      }}
      scrollEnabled={scrollEnabled}
      allowsInlineMediaPlayback
      mediaPlaybackRequiresUserAction={false}
      setSupportMultipleWindows
      webviewDebuggingEnabled={__DEV__}
    />
  )
})
