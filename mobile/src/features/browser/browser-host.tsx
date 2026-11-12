// SOURCING: react-native-webview (WKWebView: navigation, onOpenWindow, onFileDownload, injectJavaScript), expo-clipboard, react-native Share/Linking/Alert
//
// One retained browser above every destination. Pages get no bridge to
// Theorem: the only message accepted is the answer to a capture the person
// just asked for, matched by a one-time nonce and the tab's own origin.
import { useEffect, useRef, useState } from 'react'
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  TextInput,
  View,
} from 'react-native'
import { useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Clipboard from 'expo-clipboard'
import * as Crypto from 'expo-crypto'
import WebView, { type WebViewMessageEvent, type WebViewNavigation } from 'react-native-webview'

// react-native-webview 14 declares `WebView<P = undefined>`, and `Props & undefined`
// is `never`; naming P as {} restores the published props.
type Page = WebView<{}>
import { appendToDraft, currentThread } from '@/lib/drafts'
import { fonts, radius, space, touchTarget, type as typeScale } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import {
  captureReference,
  closeTab,
  hideBrowser,
  isWebUrl,
  openInBrowser,
  selectTab,
  toggleExpanded,
  updateTab,
  useBrowser,
  type Tab,
} from './store'

const ALLOWED = /^(https?:|about:blank|data:|blob:)/i

type Nav = { canGoBack: boolean; canGoForward: boolean; loading: boolean }

function Control({
  label,
  symbol,
  onPress,
  disabled,
}: {
  label: string
  symbol: string
  onPress: () => void
  disabled?: boolean
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      hitSlop={4}
      style={({ pressed }) => [styles.control, { opacity: disabled ? 0.35 : pressed ? 0.6 : 1 }]}
    >
      <Text variant="strong" tone="accent" importantForAccessibility="no">
        {symbol}
      </Text>
    </Pressable>
  )
}

function Page({
  tab,
  active,
  onNav,
  register,
}: {
  tab: Tab
  active: boolean
  onNav: (id: string, nav: Nav) => void
  register: (id: string, view: Page | null, expect: (nonce: string) => Promise<string>) => void
}) {
  const view = useRef<Page>(null)
  const pending = useRef<{ nonce: string; resolve: (text: string) => void } | undefined>(undefined)
  // The address the page loaded first; later navigation reports its own URL.
  const [source] = useState(tab.url)

  useEffect(() => {
    register(
      tab.id,
      view.current,
      (nonce) =>
        new Promise((resolve) => {
          pending.current = { nonce, resolve }
          setTimeout(() => {
            if (pending.current?.nonce === nonce) {
              pending.current = undefined
              resolve('')
            }
          }, 1500)
        }),
    )
    return () => register(tab.id, null, async () => '')
  }, [register, tab.id])

  const onMessage = (event: WebViewMessageEvent) => {
    const expected = pending.current
    if (!expected) return
    try {
      const data = JSON.parse(event.nativeEvent.data) as { nonce?: string; text?: unknown }
      const from = new URL(event.nativeEvent.url).origin
      if (data.nonce !== expected.nonce || from !== new URL(tab.url).origin) return
      pending.current = undefined
      expected.resolve(typeof data.text === 'string' ? data.text.slice(0, 4000) : '')
    } catch {
      // Anything else a page posts is ignored.
    }
  }

  const onChange = (navigation: WebViewNavigation) => {
    onNav(tab.id, {
      canGoBack: navigation.canGoBack,
      canGoForward: navigation.canGoForward,
      loading: navigation.loading,
    })
    if (isWebUrl(navigation.url))
      updateTab(tab.id, { url: navigation.url, title: navigation.title || new URL(navigation.url).host })
  }

  return (
    <View style={[StyleSheet.absoluteFill, { display: active ? 'flex' : 'none' }]}>
      <WebView<{}>
        ref={view}
        source={{ uri: source }}
        originWhitelist={['http://*', 'https://*', 'about:*', 'data:*', 'blob:*']}
        onNavigationStateChange={onChange}
        onShouldStartLoadWithRequest={(request) => {
          if (ALLOWED.test(request.url)) return true
          // Other schemes leave the app only when the person agrees.
          Alert.alert('Open in another app?', request.url, [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Open', onPress: () => void Linking.openURL(request.url) },
          ])
          return false
        }}
        onOpenWindow={(event) => {
          if (isWebUrl(event.nativeEvent.targetUrl)) openInBrowser(event.nativeEvent.targetUrl)
        }}
        onFileDownload={(event) => {
          void Share.share({ url: event.nativeEvent.downloadUrl })
        }}
        onMessage={onMessage}
        allowsBackForwardNavigationGestures
        allowsLinkPreview
        pullToRefreshEnabled
        javaScriptCanOpenWindowsAutomatically={false}
        setSupportMultipleWindows
        // Site data is device-local browser state, apart from Theorem's tokens.
        sharedCookiesEnabled={false}
      />
    </View>
  )
}

export function BrowserHost() {
  const { palette } = useTheme()
  const insets = useSafeAreaInsets()
  const browser = useBrowser()
  const [mounted, setMounted] = useState<string[]>([])
  const [navs, setNavs] = useState<Record<string, Nav>>({})
  const [address, setAddress] = useState('')
  const [editing, setEditing] = useState(false)
  const [showTabs, setShowTabs] = useState(false)
  const pages = useRef(new Map<string, { view: Page | null; expect: (nonce: string) => Promise<string> }>())
  const active = browser.tabs.find((tab) => tab.id === browser.activeId)
  const nav = active ? navs[active.id] : undefined

  // Pages mount the first time they are shown and stay alive while hidden.
  useEffect(() => {
    if (browser.visible && active && !mounted.includes(active.id)) setMounted([...mounted, active.id])
  }, [browser.visible, active, mounted])
  useEffect(() => {
    setMounted((ids) => ids.filter((id) => browser.tabs.some((tab) => tab.id === id)))
  }, [browser.tabs])
  useEffect(() => {
    if (!editing) setAddress(active?.url ?? '')
  }, [active?.url, editing])

  const register = useRef((id: string, view: Page | null, expect: (nonce: string) => Promise<string>) => {
    if (view) pages.current.set(id, { view, expect })
    else pages.current.delete(id)
  }).current
  const onNav = useRef((id: string, next: Nav) => setNavs((all) => ({ ...all, [id]: next }))).current
  const page = active ? pages.current.get(active.id) : undefined

  const go = () => {
    setEditing(false)
    const typed = address.trim()
    if (!typed) return
    const url = /^[a-z][a-z0-9+.-]*:/i.test(typed) ? typed : `https://${typed}`
    if (!isWebUrl(url)) return
    if (active) {
      updateTab(active.id, { url })
      page?.view?.injectJavaScript(`window.location.assign(${JSON.stringify(url)}); true;`)
    } else openInBrowser(url)
  }

  /** The person asked: record this page (and any selected text) in the open conversation's draft. */
  const attach = async () => {
    if (!active) return
    const thread = currentThread()
    if (!thread) {
      Alert.alert(
        'Open a conversation first',
        'Page references are added to the conversation you last had open.',
      )
      return
    }
    const nonce = Crypto.randomUUID()
    const answer = page?.expect(nonce) ?? Promise.resolve('')
    page?.view?.injectJavaScript(
      `(function(){try{window.ReactNativeWebView.postMessage(JSON.stringify({nonce:${JSON.stringify(nonce)},text:String(window.getSelection()||'')}))}catch(e){}})(); true;`,
    )
    const selectedText = await answer
    appendToDraft(
      thread,
      captureReference({
        url: active.url,
        title: active.title,
        capturedAt: new Date().toISOString(),
        selectedText,
      }),
    )
    hideBrowser()
  }

  if (!browser.tabs.length) return null
  const secure = active?.url.startsWith('https://')
  const host = active ? new URL(active.url).host : ''

  return (
    <View
      pointerEvents={browser.visible ? 'auto' : 'none'}
      style={[StyleSheet.absoluteFill, styles.layer, { display: browser.visible ? 'flex' : 'none' }]}
      accessibilityViewIsModal={browser.visible}
    >
      <View
        style={[
          styles.sheet,
          {
            backgroundColor: palette.raised,
            borderColor: palette.lineControl,
            marginTop: browser.expanded ? 0 : insets.top + space.xl,
            paddingTop: browser.expanded ? insets.top : 0,
            borderTopLeftRadius: browser.expanded ? 0 : radius.card,
            borderTopRightRadius: browser.expanded ? 0 : radius.card,
          },
        ]}
      >
        <View style={[styles.bar, { borderBottomColor: palette.lineSeparator }]}>
          <Control label="Done" symbol="Done" onPress={hideBrowser} />
          <View
            style={styles.origin}
            accessible
            accessibilityLabel={`${secure ? 'Secure' : 'Not secure'} page from ${host}`}
          >
            <Text
              variant="label"
              tone={secure ? 'muted' : 'error'}
              numberOfLines={1}
              importantForAccessibility="no"
            >
              {secure ? '🔒' : '⚠ Not secure'} {host}
            </Text>
            <Text variant="strong" numberOfLines={1} importantForAccessibility="no">
              {active?.title}
            </Text>
          </View>
          <Control
            label={browser.expanded ? 'Show as sheet' : 'Expand to full screen'}
            symbol={browser.expanded ? '↙' : '↗'}
            onPress={toggleExpanded}
          />
        </View>
        <TextInput
          value={address}
          onChangeText={setAddress}
          onFocus={() => setEditing(true)}
          onBlur={() => setEditing(false)}
          onSubmitEditing={go}
          accessibilityLabel="Address"
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          returnKeyType="go"
          selectTextOnFocus
          style={[
            styles.address,
            { color: palette.ink, backgroundColor: palette.neutral, borderColor: palette.lineControl },
          ]}
        />
        <View style={styles.pages}>
          {browser.tabs
            .filter((tab) => mounted.includes(tab.id))
            .map((tab) => (
              <Page key={tab.id} tab={tab} active={tab.id === active?.id} onNav={onNav} register={register} />
            ))}
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.toolbar, { paddingBottom: insets.bottom }]}
          style={{
            borderTopColor: palette.lineSeparator,
            borderTopWidth: StyleSheet.hairlineWidth,
            flexGrow: 0,
          }}
        >
          <Control label="Back" symbol="‹" disabled={!nav?.canGoBack} onPress={() => page?.view?.goBack()} />
          <Control
            label="Forward"
            symbol="›"
            disabled={!nav?.canGoForward}
            onPress={() => page?.view?.goForward()}
          />
          {nav?.loading ? (
            <Control label="Stop loading" symbol="×" onPress={() => page?.view?.stopLoading()} />
          ) : (
            <Control label="Reload" symbol="↻" onPress={() => page?.view?.reload()} />
          )}
          <Control
            label={`Tabs, ${browser.tabs.length} open`}
            symbol={`▢ ${browser.tabs.length}`}
            onPress={() => setShowTabs(true)}
          />
          <Control label="Attach page to conversation" symbol="Attach" onPress={() => void attach()} />
          <Control
            label="Share"
            symbol="Share"
            onPress={() => active && void Share.share({ url: active.url })}
          />
          <Control
            label="Copy link"
            symbol="Copy"
            onPress={() => active && void Clipboard.setStringAsync(active.url)}
          />
          <Control
            label="Open in Safari"
            symbol="Safari"
            onPress={() => active && void Linking.openURL(active.url)}
          />
        </ScrollView>
      </View>
      <Modal
        visible={showTabs}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowTabs(false)}
      >
        <View style={[styles.tabs, { backgroundColor: palette.neutral }]}>
          <View style={styles.bar}>
            <Text variant="title" accessibilityRole="header" style={{ flex: 1 }}>
              Tabs
            </Text>
            <Control label="Done" symbol="Done" onPress={() => setShowTabs(false)} />
          </View>
          <ScrollView>
            {browser.tabs.map((tab) => (
              <View
                key={tab.id}
                style={[
                  styles.tabRow,
                  {
                    borderBottomColor: palette.lineSeparator,
                    backgroundColor: tab.id === active?.id ? palette.selected : 'transparent',
                  },
                ]}
              >
                <Pressable
                  style={styles.tabText}
                  accessibilityRole="button"
                  accessibilityState={{ selected: tab.id === active?.id }}
                  onPress={() => {
                    selectTab(tab.id)
                    setShowTabs(false)
                  }}
                >
                  <Text variant="strong" numberOfLines={1}>
                    {tab.title}
                  </Text>
                  <Text variant="meta" tone="muted" numberOfLines={1}>
                    {tab.url}
                  </Text>
                </Pressable>
                <Control label={`Close ${tab.title}`} symbol="×" onPress={() => closeTab(tab.id)} />
              </View>
            ))}
          </ScrollView>
        </View>
      </Modal>
    </View>
  )
}

const styles = StyleSheet.create({
  layer: { zIndex: 10, backgroundColor: 'rgba(0,0,0,0.35)' },
  sheet: { flex: 1, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.sm,
    minHeight: touchTarget + 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  origin: { flex: 1, alignItems: 'center' },
  address: {
    marginHorizontal: space.md,
    marginVertical: space.sm,
    minHeight: 36,
    paddingHorizontal: space.md,
    borderRadius: radius.control,
    borderWidth: StyleSheet.hairlineWidth,
    fontFamily: fonts.meta,
    ...typeScale.label,
  },
  pages: { flex: 1 },
  toolbar: { alignItems: 'center', gap: space.xs, paddingHorizontal: space.sm },
  control: {
    minWidth: touchTarget,
    minHeight: touchTarget,
    paddingHorizontal: space.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabs: { flex: 1 },
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: space.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  tabText: { flex: 1, paddingVertical: space.md, gap: 2 },
})
