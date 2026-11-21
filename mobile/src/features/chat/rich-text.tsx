// SOURCING: Assistant UI native markdown-text.tsx (MIT), adapted to Theorem's native theme and browser.
// Copyright and permission notice: mobile/THIRD_PARTY_NOTICES.md.
// https://github.com/assistant-ui/assistant-ui/blob/main/packages/ui/src/components/react-native/assistant-ui/elements/markdown-text.tsx
// Parsing stays with react-native-marked; no HTML/WebView or handwritten Markdown parser.
import { isValidElement, memo, useDeferredValue, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { Image, Pressable, ScrollView, StyleSheet, Text as NativeText, View, type TextStyle, type ViewStyle } from 'react-native'
import * as Clipboard from 'expo-clipboard'
import { Renderer, useMarkdown, type MarkedStyles } from 'react-native-marked'
import { openInBrowser } from '@/features/browser/store'
import { fonts, radius, space, touchTarget, type as typography, type Palette } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { markdownCodeLanguage, markdownImageUrl, markdownLinkUrl, NativeTaskListTokenizer } from './rich-text-markdown'

type Variant = 'prose' | 'body'
export type RichTextProps = { text: string; variant?: Variant }

function useThrottledText(value: string): string {
  const [current, setCurrent] = useState(value)
  const lastEmit = useRef(0)
  useEffect(() => {
    const timer = setTimeout(() => {
      lastEmit.current = Date.now()
      setCurrent(value)
    }, Math.max(0, 50 - (Date.now() - lastEmit.current)))
    return () => clearTimeout(timer)
  }, [value])
  return current
}

function CodeBlock({ code, language }: { code: string; language?: string }) {
  const { palette } = useTheme()
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle')
  const generation = useRef(0)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  useEffect(() => {
    generation.current++
    setCopyState('idle')
    return () => {
      generation.current++
      clearTimeout(timer.current)
    }
  }, [code])
  const copy = async () => {
    const requestGeneration = generation.current
    try {
      const copied = await Clipboard.setStringAsync(code)
      if (generation.current !== requestGeneration) return
      setCopyState(copied ? 'copied' : 'failed')
    } catch {
      if (generation.current !== requestGeneration) return
      setCopyState('failed')
    }
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopyState('idle'), 2000)
  }
  return (
    <View style={[styles.code, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}>
      <View style={[styles.codeHeader, { borderBottomColor: palette.lineSeparator }]}>
        <Text variant="meta" tone="muted" style={styles.language}>{markdownCodeLanguage(language)}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copyState === 'copied' ? 'Code copied' : copyState === 'failed' ? 'Copy failed. Try again' : 'Copy code'}
          onPress={() => void copy()}
          style={({ pressed }) => [styles.copy, pressed && { backgroundColor: palette.hover }]}
        >
          <Text variant="label" tone={copyState === 'failed' ? 'error' : 'muted'} accessibilityLiveRegion="polite">
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Try again' : 'Copy'}
          </Text>
        </Pressable>
      </View>
      <ScrollView horizontal style={styles.horizontal} contentContainerStyle={styles.codeContent} showsHorizontalScrollIndicator>
        <View>
          <Text variant="code" selectable>{code}</Text>
        </View>
      </ScrollView>
    </View>
  )
}

function MarkdownImage({ uri, alt, href }: { uri: string; alt?: string; href?: string }) {
  const { palette } = useTheme()
  const [failed, setFailed] = useState(false)
  const [aspectRatio, setAspectRatio] = useState(4 / 3)
  const source = markdownImageUrl(uri)
  const target = markdownLinkUrl(href ?? uri)
  useEffect(() => { setFailed(false); setAspectRatio(4 / 3) }, [uri])
  const caption = alt?.trim() || 'Image'
  if (!source || failed) {
    return (
      <View style={[styles.imageFallback, { borderColor: palette.lineSeparator }]}>
        <Text selectable>{caption}</Text>
        <Text variant="label" tone="muted">{failed ? 'Image could not be loaded.' : 'Image preview is unavailable.'}</Text>
        {target && <Pressable style={styles.imageLink} accessibilityRole="link" accessibilityLabel={`Open ${caption}`} onPress={() => openInBrowser(target)}><Text variant="label" tone="accent">Open image</Text></Pressable>}
      </View>
    )
  }
  return (
    <Pressable
      disabled={!target}
      accessibilityRole={target ? 'link' : 'image'}
      accessibilityLabel={caption}
      accessibilityHint={target ? target.startsWith('mailto:') ? 'Opens an email link' : 'Opens in the in-app browser' : undefined}
      onPress={target ? () => openInBrowser(target) : undefined}
      style={[styles.image, { aspectRatio, backgroundColor: palette.raised }]}
    >
      <Image
        source={{ uri: source }}
        style={StyleSheet.absoluteFill}
        resizeMode="contain"
        accessible={false}
        onLoad={({ nativeEvent }) => {
          const { width, height } = nativeEvent.source
          if (width > 0 && height > 0) setAspectRatio(Math.max(0.5, Math.min(3, width / height)))
        }}
        onError={() => setFailed(true)}
      />
    </Pressable>
  )
}

function TableCellContent({ nodes, header }: { nodes: ReactNode[]; header: boolean }) {
  const { palette } = useTheme()
  const groups: ReactNode[] = []
  let inline: ReactNode[] = []
  const flush = () => {
    if (!inline.length) return
    groups.push(<NativeText key={`text-${groups.length}`} selectable style={{ color: palette.ink, fontFamily: header ? fonts.agentStrong : fonts.agent, ...typography.body }}>{inline}</NativeText>)
    inline = []
  }
  // A Markdown image is a native view, so it cannot be a child of selectable Text.
  for (const node of nodes) {
    if (isValidElement(node) && node.type === MarkdownImage) {
      flush()
      groups.push(node)
    } else inline.push(node)
  }
  flush()
  return <>{groups}</>
}

function MarkdownTable({ header, rows }: { header: ReactNode[][]; rows: ReactNode[][][] }) {
  const { palette } = useTheme()
  const [width, setWidth] = useState(0)
  // Keep columns readable; horizontal scrolling owns excess width, never the transcript.
  const columnWidth = Math.max(132, width > 0 ? width / Math.max(1, header.length) : 132)
  return (
    <View style={[styles.table, { borderColor: palette.lineSeparator }]} onLayout={(event) => setWidth(event.nativeEvent.layout.width)}>
      <ScrollView horizontal style={styles.horizontal} showsHorizontalScrollIndicator>
        <View>
          {[header, ...rows].map((row, rowIndex) => (
            <View key={rowIndex} style={[styles.tableRow, rowIndex === 0 && { backgroundColor: palette.raised }]}>
              {row.map((cell, columnIndex) => (
                <View key={columnIndex} style={[styles.tableCell, { width: columnWidth, borderColor: palette.lineSeparator }, rowIndex > 0 && styles.tableBodyCell]}>
                  <TableCellContent nodes={cell} header={rowIndex === 0} />
                </View>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  )
}

/** Fresh per parse, with repeatable ordinals so streaming doesn't remount every native child. */
class NativeMarkdownRenderer extends Renderer {
  private keyIndex = 0
  constructor(_source: string, private readonly palette: Palette) { super({ selectable: true }) }
  override getKey(): string { return `theorem-md-${this.keyIndex++}` }
  override code(text: string, language?: string): ReactNode {
    return <CodeBlock key={this.getKey()} code={text} language={language} />
  }
  override heading(text: string | ReactNode[], textStyle?: TextStyle): ReactNode {
    return <NativeText key={this.getKey()} selectable accessibilityRole="header" style={textStyle}>{text}</NativeText>
  }
  override link(children: string | ReactNode[], href: string, textStyle?: TextStyle): ReactNode {
    // Table cells use the parser's inline path; unlike paragraphs, that path
    // sends linked images through link(). Keep their native view out of Text.
    const child = Array.isArray(children) && children.length === 1 ? children[0] : undefined
    if (isValidElement<{ uri: string; alt?: string }>(child) && child.type === MarkdownImage) {
      return <MarkdownImage key={this.getKey()} uri={child.props.uri} alt={child.props.alt} href={href} />
    }
    const url = markdownLinkUrl(href)
    return (
      <NativeText
        key={this.getKey()}
        selectable
        accessibilityRole={url ? 'link' : undefined}
        accessibilityHint={url ? url.startsWith('mailto:') ? 'Opens an email link' : 'Opens in the in-app browser' : undefined}
        onPress={url ? () => openInBrowser(url) : undefined}
        style={url ? textStyle : [textStyle, { color: this.palette.ink, textDecorationLine: 'none' }]}
      >{children}</NativeText>
    )
  }
  override image(uri: string, alt?: string): ReactNode {
    return <MarkdownImage key={this.getKey()} uri={uri} alt={alt} />
  }
  override linkImage(href: string, imageUrl: string, alt?: string): ReactNode {
    return <MarkdownImage key={this.getKey()} uri={imageUrl} alt={alt} href={href} />
  }
  override table(header: ReactNode[][], rows: ReactNode[][][]): ReactNode {
    return <MarkdownTable key={this.getKey()} header={header} rows={rows} />
  }
  override paragraph(children: ReactNode[], containerStyle?: ViewStyle): ReactNode {
    return <View key={this.getKey()} style={[containerStyle, styles.contained]}>{children}</View>
  }
}

function markdownStyles(palette: Palette, variant: Variant): MarkedStyles {
  const body: TextStyle = { fontFamily: variant === 'prose' ? fonts.agent : fonts.ui, ...typography[variant], color: palette.ink }
  const strongFamily = variant === 'prose' ? fonts.agentStrong : fonts.uiStrong
  const heading = (size: number, lineHeight: number, top: number): TextStyle => ({
    color: palette.ink, fontFamily: strongFamily, fontWeight: 'normal', fontSize: size, lineHeight,
    marginTop: top, marginBottom: space.sm, paddingBottom: 0, borderBottomWidth: 0,
  })
  return {
    text: body,
    paragraph: { paddingVertical: space.xs },
    em: { ...body, fontStyle: 'italic' },
    strong: { ...body, fontFamily: strongFamily, fontWeight: 'normal' },
    strikethrough: { ...body, textDecorationLine: 'line-through' },
    li: { ...body, flexShrink: 1, minWidth: 0 },
    list: { paddingVertical: space.xs },
    link: { ...body, color: palette.link, fontStyle: 'normal', textDecorationLine: 'underline' },
    codespan: { ...body, fontFamily: fonts.code, fontSize: 14, fontStyle: 'normal', fontWeight: 'normal', backgroundColor: palette.hover },
    blockquote: { borderLeftColor: palette.lineControl, borderLeftWidth: 2, paddingLeft: space.md, marginVertical: space.sm, opacity: 1 },
    hr: { borderBottomColor: palette.lineSeparator, borderBottomWidth: StyleSheet.hairlineWidth, marginVertical: space.lg },
    h1: heading(24, 32, space.lg),
    h2: heading(21, 28, space.lg),
    h3: heading(18, 26, space.md),
    h4: heading(17, 25, space.md),
    h5: heading(16, 24, space.sm),
    h6: heading(16, 24, space.sm),
  }
}

function RichTextImpl({ text, variant = 'prose' }: RichTextProps) {
  const { palette, scheme } = useTheme()
  const deferredText = useDeferredValue(useThrottledText(text))
  const renderer = useMemo(() => new NativeMarkdownRenderer(deferredText, palette), [deferredText, palette])
  const textStyles = useMemo(() => markdownStyles(palette, variant), [palette, variant])
  const tokenizer = useMemo(() => new NativeTaskListTokenizer(), [deferredText])
  const options = useMemo(() => ({ colorScheme: scheme, renderer, styles: textStyles, tokenizer }), [scheme, renderer, textStyles, tokenizer])
  // Parse the complete message: splitting each block loses reference links defined in a later block.
  // useMarkdown yields native elements, avoiding a second vertical FlatList inside the thread.
  const elements = useMarkdown(deferredText, options)
  return <View style={styles.contained}>{elements}</View>
}

export const RichText = memo(RichTextImpl)

const styles = StyleSheet.create({
  contained: { minWidth: 0, maxWidth: '100%', alignSelf: 'stretch' },
  horizontal: { maxWidth: '100%', minWidth: 0, alignSelf: 'stretch' },
  code: { minWidth: 0, maxWidth: '100%', alignSelf: 'stretch', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, overflow: 'hidden', marginVertical: space.sm },
  codeHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: space.md, borderBottomWidth: StyleSheet.hairlineWidth },
  language: { flexShrink: 1, paddingVertical: space.sm },
  copy: { minHeight: touchTarget, minWidth: 64, paddingHorizontal: space.md, alignItems: 'center', justifyContent: 'center' },
  codeContent: { padding: space.md },
  image: { width: '100%', maxWidth: '100%', borderRadius: radius.card, overflow: 'hidden', marginVertical: space.sm },
  imageFallback: { maxWidth: '100%', borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: space.md, gap: space.xs, marginVertical: space.sm },
  imageLink: { minHeight: touchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  table: { minWidth: 0, maxWidth: '100%', alignSelf: 'stretch', borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden', marginVertical: space.sm },
  tableRow: { flexDirection: 'row', alignItems: 'stretch' },
  tableCell: { paddingHorizontal: space.md, paddingVertical: space.sm, borderRightWidth: StyleSheet.hairlineWidth },
  tableBodyCell: { borderTopWidth: StyleSheet.hairlineWidth },
})
