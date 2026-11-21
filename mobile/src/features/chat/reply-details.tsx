// SOURCING: native Pressable/ScrollView and Theorem's normalized activity parts.
import { Component, useState, type ReactNode } from 'react'
import { Pressable, ScrollView, StyleSheet, View } from 'react-native'
import { space, radius, touchTarget } from '@/theme/tokens'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { activitySummary, activityTitle, detailsText, object, string } from './message-presentation'

export function Disclosure({ title, children, subtitle }: { title: string; children: ReactNode; subtitle?: string }) {
  const { palette } = useTheme()
  const [open, setOpen] = useState(false)
  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={subtitle ? `${title}, ${subtitle}` : title}
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen(!open)}
        style={({ pressed }) => [styles.trigger, pressed && { backgroundColor: palette.hover }]}
      >
        <View style={styles.title}>
          <Text variant="label" tone="muted">{title}</Text>
          {subtitle ? <Text variant="label" tone="faint">{subtitle}</Text> : null}
        </View>
        <Text variant="label" tone="faint" accessible={false}>{open ? '⌃' : '›'}</Text>
      </Pressable>
      {open ? <View style={[styles.details, { borderColor: palette.lineSeparator }]}>{children}</View> : null}
    </View>
  )
}

export function InspectDetails({ value }: { value: unknown }) {
  return (
    <ScrollView style={styles.inspector} nestedScrollEnabled>
      <Text variant="code" selectable>{detailsText(value)}</Text>
    </ScrollView>
  )
}

function ActivityEntry({ part }: { part: unknown }) {
  const value = object(part)
  const data = object(value.data)
  if (value.type === 'reasoning' || value.name === 'theorem-reasoning_summary') {
    const text = string(value.text) ?? string(data.text) ?? string(data.summary)
    return (
      <Disclosure title="Reasoning summary">
        {text ? <Text variant="prose" tone="muted" selectable>{text}</Text> : <InspectDetails value={data} />}
      </Disclosure>
    )
  }
  if (value.type === 'tool-call') {
    const subtitle = value.isError ? 'Failed' : value.result !== undefined ? 'Result available' : undefined
    return (
      <Disclosure title={activityTitle(part)} subtitle={subtitle}>
        {string(value.argsText) ? <><Text variant="label" tone="muted">Input</Text><InspectDetails value={value.argsText} /></> : null}
        {value.result !== undefined ? <><Text variant="label" tone="muted">Result</Text><InspectDetails value={value.result} /></> : null}
        {value.result === undefined ? <Text variant="label" tone="muted">No result has been received.</Text> : null}
      </Disclosure>
    )
  }
  if (value.name === 'theorem-progress') {
    return <Text variant="label" tone="muted" style={styles.progress}>{activityTitle(part)}</Text>
  }
  return <Disclosure title={activityTitle(part)}><InspectDetails value={value.data ?? value} /></Disclosure>
}

/** One activity control per reply. The final message lifecycle overrides old progress events. */
export function ReplyActivity({ parts, entries, status, liveStatusInPresence = false }: {
  parts: readonly unknown[]
  entries: readonly { part: unknown; key: string }[]
  status: unknown
  liveStatusInPresence?: boolean
}) {
  const { palette } = useTheme()
  const [open, setOpen] = useState(false)
  const summary = activitySummary(parts, status, entries.length > 0, liveStatusInPresence)
  if (!summary) return null
  const color = { neutral: palette.inkMuted, live: palette.inkMuted, attention: palette.attentionInk, error: palette.errorInk }[summary.tone]
  const symbols = { neutral: '', live: '● ', attention: '! ', error: '× ' }
  const line = <Text variant="label" style={{ color }}>{symbols[summary.tone]}{summary.label}</Text>
  return (
    <View>
      {entries.length ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${summary.label}. ${open ? 'Hide' : 'Show'} activity details`}
          accessibilityState={{ expanded: open }}
          onPress={() => setOpen(!open)}
          style={({ pressed }) => [styles.trigger, pressed && { backgroundColor: palette.hover }]}
        >
          <View style={styles.title}>{line}</View>
          <Text variant="label" tone="faint" accessible={false}>{open ? '⌃' : '⌄'}</Text>
        </Pressable>
      ) : <View style={styles.status}>{line}</View>}
      {open && entries.length ? (
        <View style={[styles.activity, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}>
          {entries.map(({ part, key }) => <PartBoundary key={key} resetKey={part}><ActivityEntry part={part} /></PartBoundary>)}
        </View>
      ) : null}
    </View>
  )
}

/** A malformed rich part cannot take the transcript or its composer down with it. */
export class PartBoundary extends Component<{ children: ReactNode; resetKey: unknown }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidUpdate(previous: Readonly<{ children: ReactNode; resetKey: unknown }>) {
    if (this.state.failed && previous.resetKey !== this.props.resetKey) this.setState({ failed: false })
  }
  render() {
    return this.state.failed
      ? <Text variant="label" tone="muted">This part of the reply could not be displayed.</Text>
      : this.props.children
  }
}

const styles = StyleSheet.create({
  trigger: { minHeight: touchTarget, flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.sm, borderRadius: radius.control },
  title: { flex: 1, gap: space.xs },
  details: { padding: space.sm, gap: space.sm, borderLeftWidth: StyleSheet.hairlineWidth, marginLeft: space.sm },
  inspector: { maxHeight: 280 },
  activity: { padding: space.sm, borderWidth: StyleSheet.hairlineWidth, borderRadius: radius.card },
  status: { paddingVertical: space.sm },
  progress: { paddingVertical: space.sm, paddingHorizontal: space.sm },
})
