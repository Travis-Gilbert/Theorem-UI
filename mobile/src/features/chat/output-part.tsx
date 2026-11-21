// SOURCING: Theorem message parts, existing ApprovalCard/EventProposalCard, expo-image.
// Protected upload IDs remain metadata until the SDK exposes a native content route.
import { useState, type ReactNode } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Image } from 'expo-image'
import type { MessageState } from '@assistant-ui/react-native'
import { openInBrowser } from '@/features/browser/store'
import { radius, space } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { AppCheckRow } from '../apps/app-checks'
import { AppFrame } from '../apps/app-frame'
import { appRevisionOf, ARTIFACT_PART } from '../apps/operations'
import { PROPOSE_EVENT } from '../phone-actions/calendar'
import { EventProposalCard } from '../phone-actions/event-card'
import { awaitsDecision, readApproval } from './approval'
import { ApprovalCard } from './approval-card'
import { completionNotice, errorMessage, imageUri, object, string, toolResultOf, unavailablePreviewText, webUrl } from './message-presentation'
import { Disclosure, InspectDetails } from './reply-details'
import { RichText } from './rich-text'

type Part = MessageState['content'][number]

function Card({ title, children, alert = false }: { title: string; children: ReactNode; alert?: boolean }) {
  const { palette } = useTheme()
  return (
    <View style={[styles.card, { backgroundColor: alert ? palette.errorContainer : palette.raised, borderColor: alert ? palette.errorInk : palette.lineSeparator }]}
      accessibilityRole={alert ? 'alert' : undefined}>
      <Text variant="strong" tone={alert ? 'error' : 'ink'}>{title}</Text>
      {children}
    </View>
  )
}

function ImagePreview({ uri, label }: { uri: string; label: string }) {
  const { palette, reduceMotion } = useTheme()
  const [failed, setFailed] = useState(false)
  const [open, setOpen] = useState(false)
  return (
    <>
      {failed ? <Text variant="label" tone="muted">The image preview could not be loaded.</Text> : (
        <Pressable accessibilityRole="button" accessibilityLabel={`Expand ${label}`} onPress={() => setOpen(true)}>
          <Image source={{ uri }} contentFit="contain" cachePolicy="memory" style={styles.image}
            accessibilityLabel={label} onError={() => setFailed(true)} />
          <Text variant="label" tone="faint">Tap to expand</Text>
        </Pressable>
      )}
      <Modal visible={open} animationType={reduceMotion ? 'none' : 'fade'} onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={[styles.fill, { backgroundColor: palette.neutral }]} accessibilityViewIsModal>
          <View style={styles.imageHeader}><Text variant="strong" style={styles.imageTitle}>{label}</Text><Button label="Done" variant="quiet" onPress={() => setOpen(false)} /></View>
          <ScrollView contentContainerStyle={styles.expandedImage} minimumZoomScale={1} maximumZoomScale={4} centerContent>
            <Image source={{ uri }} contentFit="contain" cachePolicy="memory" style={styles.expandedContent} accessibilityLabel={label} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </>
  )
}

function FileCard({ value, image }: { value: unknown; image?: boolean }) {
  const data = object(value)
  const name = string(data.fileName) ?? string(data.filename) ?? string(data.name) ?? string(data.title) ?? (image ? 'Image' : 'File')
  const mime = string(data.mediaType) ?? string(data.mimeType)
  const url = webUrl(data.url ?? data.href ?? (data.sourceType === 'id' ? undefined : data.data))
  const uri = data.image !== undefined || data.url !== undefined
    ? imageUri(data.image ?? data.url, mime)
    : imageUri(data.data, mime, data.sourceType)
  const isImage = image || data.image !== undefined || mime?.startsWith('image/')
  const state = string(data.state)
  const status: Record<string, string> = { pending: 'Waiting to upload', uploading: 'Uploading', paused: 'Upload paused', failed: 'Upload failed', refused: 'Upload refused' }
  return (
    <Card title={name}>
      {mime ? <Text variant="label" tone="muted">{mime}</Text> : null}
      {status[state ?? ''] ? <Text variant="label" tone={state === 'failed' || state === 'refused' ? 'error' : 'muted'}>{status[state!]}</Text> : null}
      {isImage && uri ? <ImagePreview key={uri} uri={uri} label={name} /> : null}
      {url ? <Button label={isImage ? 'Open image' : 'Open file'} variant="quiet" onPress={() => openInBrowser(url)} /> : (
        !(isImage && uri) ? <Text variant="label" tone="muted">{unavailablePreviewText(state)}</Text> : null
      )}
    </Card>
  )
}

function UnsupportedContent({ value, title = 'Content unavailable' }: { value: unknown; title?: string }) {
  const data = object(value)
  const label = string(data.title) ?? string(data.name) ?? title
  const text = typeof value === 'string' ? value : string(data.text) ?? string(data.markdown) ?? string(data.description) ?? string(data.summary)
  const url = webUrl(data.url ?? data.href)
  return (
    <Card title={label}>
      {text ? <RichText text={text} variant="body" /> : null}
      <Text variant="label" tone="muted">This reply includes content this app cannot display yet.</Text>
      {url ? <Button label="Open content" variant="quiet" onPress={() => openInBrowser(url)} /> : null}
      <Disclosure title="Inspect content details"><InspectDetails value={value} /></Disclosure>
    </Card>
  )
}

export function OutputPart({ part, runId, running, user = false }: { part: Part; runId?: string; running: boolean; user?: boolean }) {
  if (part.type === 'text') return <RichText text={part.text} variant={user ? 'body' : 'prose'} />
  if (part.type === 'tool-call') {
    const approval = readApproval(part.artifact)
    const result = toolResultOf(part)
    // The SDK retains approval history on tool results. Never offer a stale decision after a result.
    const showApproval = approval && (!result || !awaitsDecision(approval))
    return approval ? (
      <View>
        {showApproval ? <ApprovalCard approval={approval} runId={runId} argsText={part.argsText} /> : null}
        {result ? (
          <Disclosure title={result.label}>
            {!showApproval && part.argsText ? <><Text variant="label" tone="muted">Input</Text><InspectDetails value={part.argsText} /></> : null}
            <Text variant="label" tone={part.isError ? 'error' : 'muted'}>{result.label}</Text>
            <InspectDetails value={result.value} />
          </Disclosure>
        ) : null}
      </View>
    ) : <UnsupportedContent value={part} title="Tool result" />
  }
  if (part.type === 'image') return <FileCard value={part} image />
  if (part.type === 'file') return <FileCard value={part} />
  if (part.type !== 'data') return <UnsupportedContent value={part} />
  const data = object(part.data)
  switch (part.name) {
    case 'theorem-attachment': return <FileCard value={data} />
    case 'theorem-error':
      return <Card title="Reply interrupted" alert><Text variant="prose" selectable>{errorMessage(data)}</Text></Card>
    case 'theorem-completion': {
      const notice = completionNotice(data)
      return notice ? <Card title="Run limit reached"><Text variant="prose">{notice}</Text></Card> : null
    }
    case 'theorem-user_input': {
      const text = string(data.text)
      const status = string(data.status)
      return (
        <Card title="Your follow-up">
          {text ? <RichText text={text} variant="body" /> : null}
          {status !== 'delivered' ? <Text variant="label" tone={status === 'not_delivered' ? 'error' : 'muted'}>
            {status === 'not_delivered' ? 'This follow-up was not delivered.' : 'Waiting for the run to receive this follow-up.'}
          </Text> : null}
        </Card>
      )
    }
    case 'theorem-client_operation':
      if (data.operation === PROPOSE_EVENT && typeof data.requestRef === 'string') return (
        <EventProposalCard runId={runId} request={{ requestRef: data.requestRef, state: string(data.state) ?? 'pending', args: data.args }} />
      )
      // Keep the real native App host mounted: this row runs the typed check and sends its receipt.
      if (typeof data.operation === 'string' && data.operation.startsWith('app.') && typeof data.requestRef === 'string') return (
        <AppCheckRow
          runId={runId}
          running={running}
          data={part.data}
          request={{
            requestRef: data.requestRef,
            operation: data.operation,
            state: string(data.state) ?? 'pending',
            args: object(data.args),
            expectedRevision: typeof data.expectedRevision === 'number' ? data.expectedRevision : 0,
          }}
        />
      )
      return <UnsupportedContent value={data} title="Requested action" />
    case ARTIFACT_PART: {
      const app = appRevisionOf(part.data)
      return app ? <AppFrame key={app.revision} app={app} /> : <UnsupportedContent value={data} title="Artifact" />
    }
    case 'theorem-scene': return <UnsupportedContent value={data} title="Interactive scene" />
    default: return <UnsupportedContent value={part.data} />
  }
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card, padding: space.md, gap: space.sm, marginVertical: space.xs },
  image: { width: '100%', height: 220, borderRadius: radius.control },
  imageHeader: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md },
  imageTitle: { flex: 1 },
  expandedImage: { flexGrow: 1 },
  expandedContent: { width: '100%', height: '100%', minHeight: 300 },
})
