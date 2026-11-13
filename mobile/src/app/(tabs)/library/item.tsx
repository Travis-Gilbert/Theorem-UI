// SOURCING: files.read, links, backlinks and suggestions through @/features/library/files; react-native-webview for saved pages and PDFs; expo-file-system for the PDF's cache file
//
// One item: what it is, its content, how it connects to other items
// (explicit links apart from Theorem's suggestions), where it came from, and
// the identifiers and full time that stay out of the lists.
import { useEffect, useState } from 'react'
import { ScrollView, StyleSheet, View } from 'react-native'
import { router, Stack, useLocalSearchParams } from 'expo-router'
import { File, Paths } from 'expo-file-system'
import { WebView } from 'react-native-webview'
import { LinkedText } from '@/features/chat/linked-text'
import { threadTitle } from '@/features/chat/threads'
import { loadProvenance, loadRelated, loadVault, readFile } from '@/features/library/files'
import { openItem } from '@/features/library/item-row'
import { metaLine, type LibraryItem } from '@/features/library/model'
import { togglePin, usePins } from '@/features/library/pins'
import type { Related } from '@/features/library/related'
import { fullTime, recency } from '@/lib/time'
import { describeError, statusOf } from '@/lib/theorem'
import { useRequest } from '@/lib/use-request'
import { space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { Unavailable } from '@/ui/unavailable'

export default function ItemScreen() {
  const { path } = useLocalSearchParams<{ path: string }>()
  const vault = useRequest(loadVault, [])
  const pinned = usePins().includes(path)
  const item = vault.data?.items.find((candidate) => candidate.path === path)

  if (vault.status === 'failed')
    return (
      <Unavailable title="The library did not load" reason={describeError(vault.error)}>
        <Button label="Try again" onPress={vault.reload} />
      </Unavailable>
    )
  if (!vault.data)
    return (
      <View style={styles.message}>
        <StatusLabel tone="live" label="Loading" />
      </View>
    )
  if (!item) return <Unavailable title="This item is no longer in the library" reason={path} />
  return (
    <>
      <Stack.Screen options={{ title: item.title }} />
      <Stack.Toolbar placement="right">
        <Stack.Toolbar.Button
          icon={pinned ? 'pin.fill' : 'pin'}
          accessibilityLabel={pinned ? 'Unpin from this device' : 'Pin on this device'}
          onPress={() => togglePin(path)}
        />
      </Stack.Toolbar>
      <ScrollView contentInsetAdjustmentBehavior="automatic" contentContainerStyle={styles.body}>
        <View style={styles.heading}>
          <Text variant="title">{item.title}</Text>
          <Text variant="label" tone="muted">
            {metaLine(item, recency(item.modifiedMs))}
          </Text>
        </View>
        <Content item={item} />
        <RelatedSection path={path} />
        {item.documentId ? <SourceSection documentId={item.documentId} /> : null}
        <Details item={item} />
      </ScrollView>
    </>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text variant="label" tone="muted" style={styles.sectionTitle}>
        {title}
      </Text>
      {children}
    </View>
  )
}

function Content({ item }: { item: LibraryItem }) {
  const file = useRequest(() => readFile(item.path), [item.path])
  if (file.status === 'failed')
    return (
      <View style={styles.pad}>
        <Text tone="error">{describeError(file.error)}</Text>
        <Button label="Try again" onPress={file.reload} />
      </View>
    )
  if (!file.data)
    return (
      <View style={styles.pad}>
        <StatusLabel tone="live" label="Loading content" />
      </View>
    )
  const { encoding, data } = file.data
  if (item.type === 'pdf' && encoding === 'base64') return <Pdf path={item.path} data={data} />
  if (item.type === 'page' && encoding === 'utf8') return <Page html={data} />
  if (encoding === 'utf8')
    return (
      <View style={styles.pad}>
        {item.readOnly || item.type !== 'note' ? null : (
          <Text variant="label" tone="muted">
            Editing notes on iPhone is not available yet; edit this note on theorem.rs.
          </Text>
        )}
        <LinkedText text={data.trim() || 'This item is empty.'} />
      </View>
    )
  return (
    <View style={styles.pad}>
      <Text tone="muted">A preview of this kind of file is not available on iPhone yet.</Text>
    </View>
  )
}

/** A saved page, shown without scripts. */
function Page({ html }: { html: string }) {
  return (
    <View style={styles.web}>
      <WebView source={{ html }} javaScriptEnabled={false} originWhitelist={['about:*']} nestedScrollEnabled />
    </View>
  )
}

/** WKWebView shows a PDF from a file, not from a data URL, so the bytes go to the cache first. */
function Pdf({ path, data }: { path: string; data: string }) {
  const [uri, setUri] = useState<string>()
  const [failure, setFailure] = useState<string>()
  useEffect(() => {
    try {
      const file = new File(Paths.cache, `library-${Math.abs(hash(path))}.pdf`)
      if (file.exists) file.delete()
      file.create()
      file.write(data, { encoding: 'base64' })
      setUri(file.uri)
      return () => {
        if (file.exists) file.delete()
      }
    } catch (error) {
      setFailure(describeError(error))
    }
  }, [path, data])
  if (failure) return <Text tone="error" style={styles.pad}>{failure}</Text>
  if (!uri) return null
  return (
    <View style={styles.web}>
      <WebView source={{ uri }} allowingReadAccessToURL={Paths.cache.uri} originWhitelist={['file:*']} nestedScrollEnabled />
    </View>
  )
}

const hash = (text: string) => [...text].reduce((total, char) => (total * 31 + char.charCodeAt(0)) | 0, 7)

function RelatedSection({ path }: { path: string }) {
  const related = useRequest(() => loadRelated(path), [path])
  return (
    <Section title="Related">
      {related.status === 'failed' ? (
        <View style={styles.pad}>
          <Text tone="error">{describeError(related.error)}</Text>
          <Button label="Try again" onPress={related.reload} />
        </View>
      ) : !related.data ? (
        <View style={styles.pad}>
          <StatusLabel tone="live" label="Loading related items" />
        </View>
      ) : (
        <>
          <Group title="Linked" entries={related.data.linked} empty="Nothing links to or from this item." />
          {related.data.suggestionsUnavailable ? (
            <Unavailable title="Suggestions are not available" reason={related.data.suggestionsUnavailable} />
          ) : (
            <Group
              title="Suggested by Theorem"
              entries={related.data.suggested}
              empty="Theorem has no suggestions for this item."
            />
          )}
        </>
      )}
    </Section>
  )
}

function Group({ title, entries, empty }: { title: string; entries: Related[]; empty: string }) {
  return (
    <View>
      <Text variant="strong" style={styles.groupTitle}>
        {title}
      </Text>
      {entries.length ? (
        entries.map((entry) => (
          <Row
            key={entry.path}
            prominence="regular"
            title={entry.title}
            detail={entry.how}
            onPress={() => openItem(entry.path)}
          />
        ))
      ) : (
        <Text tone="muted" style={styles.pad}>
          {empty}
        </Text>
      )}
    </View>
  )
}

function SourceSection({ documentId }: { documentId: string }) {
  const source = useRequest(() => loadProvenance(documentId), [documentId])
  if (!source.data) return null
  const { lines, thread, runId } = source.data
  return (
    <Section title="Source">
      {lines.map((line) => (
        <Text key={line} style={styles.pad}>
          {line}
        </Text>
      ))}
      {thread ? (
        <Row
          prominence="regular"
          title={threadTitle(thread)}
          detail="Open the conversation that produced this"
          onPress={() =>
            router.navigate({ pathname: '/chat', params: { thread: thread.threadId, project: thread.projectId } })
          }
        />
      ) : runId ? (
        <Text tone="muted" variant="label" style={styles.pad}>
          Theorem records the run that wrote this, but none of your conversations carries it.
        </Text>
      ) : null}
    </Section>
  )
}

function Details({ item }: { item: LibraryItem }) {
  const lines = [
    ['Path', item.path],
    ['Modified', fullTime(item.modifiedMs)],
    ['Size', `${item.size.toLocaleString()} bytes`],
    ['Access', item.readOnly ? 'Read only' : 'Editable'],
    ...(item.documentId ? [['Document', item.documentId]] : []),
  ]
  return (
    <Section title="Details">
      {lines.map(([name, value]) => (
        <View key={name} style={styles.detail}>
          <Text variant="label" tone="muted">
            {name}
          </Text>
          <Text variant="label" selectable>
            {value}
          </Text>
        </View>
      ))}
    </Section>
  )
}

const styles = StyleSheet.create({
  body: { paddingBottom: space.xl },
  heading: { padding: space.lg, gap: space.xs },
  pad: { paddingHorizontal: space.lg, paddingVertical: space.md, gap: space.md },
  section: { paddingTop: space.lg },
  sectionTitle: { paddingHorizontal: space.lg, paddingBottom: space.xs },
  groupTitle: { paddingHorizontal: space.lg, paddingTop: space.sm },
  detail: { paddingHorizontal: space.lg, paddingVertical: space.xs, gap: 2 },
  web: { height: 480 },
  message: { padding: space.xl, alignItems: 'center' },
})
