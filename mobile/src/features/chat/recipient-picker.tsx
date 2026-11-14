// SOURCING: react-native Modal (pageSheet presentation on iOS), TextInput; chat.projects through ./threads; saved computers through features/agents/computers; kv (local-db.ts) for the last choice
//
// Who receives the message: Theo in a project, or Claude Code or Codex in a
// folder on a saved computer. Only recipients this phone has are listed:
// the projects Theorem returned and the computers saved here. Which model or
// harness answers is not a choice made here. The last choice is remembered on
// this device; it holds no credential.
import { useState } from 'react'
import { Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native'
import { router } from 'expo-router'
import { kv } from '@/lib/local-db'
import { describeError, type Theorem } from '@/lib/theorem'
import { fonts, radius, space, touchTarget, type as typeScale } from '@/theme/tokens'
import { Button } from '@/ui/button'
import { Row } from '@/ui/row'
import { StatusLabel } from '@/ui/status'
import { Text } from '@/ui/text'
import { useTheme } from '@/ui/theme'
import { useComputers, type ComputerEntry } from '../agents/computers'
import { agentName, type Agent } from '../agents/shell'

export type Destination =
  | { kind: 'theorem'; projectId: string; projectTitle: string }
  | { kind: 'agent'; agent: Agent; computerId: string; computerName: string; folder: string }

const LAST = 'chat.last-destination'

export function lastDestination(): Destination | undefined {
  try {
    const saved = JSON.parse(kv.get(LAST) ?? 'null') as Destination | null
    return saved ?? undefined
  } catch {
    return undefined
  }
}

export function rememberDestination(destination: Destination) {
  kv.set(LAST, JSON.stringify(destination))
}

export const destinationName = (destination: Destination) =>
  destination.kind === 'theorem' ? 'Theo' : agentName[destination.agent]

export const destinationDetail = (destination: Destination) =>
  destination.kind === 'theorem'
    ? destination.projectTitle
    : `${destination.computerName} · ${destination.folder === '~' ? 'home folder' : destination.folder}`

function folderFor(computerId: string, current: Destination | undefined) {
  if (current?.kind === 'agent' && current.computerId === computerId) return current.folder
  return kv.get(`chat.folder.${computerId}`) ?? '~'
}

function ComputerOptions({
  entry,
  current,
  onChoose,
}: {
  entry: ComputerEntry
  current: Destination | undefined
  onChoose: (destination: Destination) => void
}) {
  const { palette } = useTheme()
  const { computer } = entry
  const [folder, setFolder] = useState(() => folderFor(computer.id, current))
  const reason =
    entry.status === 'failed'
      ? `Could not reach ${computer.name}: ${describeError(entry.error)}`
      : entry.status === 'ready' && !entry.tmux
        ? `${computer.name} has no tmux. Install it there to start conversations.`
        : undefined
  const choose = (agent: Agent) => {
    const chosen = folder.trim() || '~'
    kv.set(`chat.folder.${computer.id}`, chosen)
    onChoose({ kind: 'agent', agent, computerId: computer.id, computerName: computer.name, folder: chosen })
  }
  return (
    <View style={styles.group}>
      <View style={styles.groupHead}>
        <Text variant="label" tone="muted" accessibilityRole="header">
          {computer.name.toUpperCase()}
        </Text>
        {entry.status === 'loading' ? <StatusLabel tone="live" label="Checking" /> : null}
      </View>
      <View style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}>
        {(['claude', 'codex'] as const).map((agent) => {
          const selected = current?.kind === 'agent' && current.computerId === computer.id && current.agent === agent
          return (
            <Row
              key={agent}
              title={agentName[agent]}
              detail={reason ?? `In ${folder.trim() || '~'} on ${computer.name}`}
              selected={selected}
              trailing={selected ? <Text tone="accent">✓</Text> : undefined}
              onPress={reason ? undefined : () => choose(agent)}
            />
          )
        })}
        <View style={styles.folder}>
          <Text variant="label" tone="muted">
            Folder
          </Text>
          <TextInput
            value={folder}
            onChangeText={setFolder}
            autoCapitalize="none"
            autoCorrect={false}
            spellCheck={false}
            accessibilityLabel={`Folder on ${computer.name}`}
            placeholder="~"
            placeholderTextColor={palette.inkFaint}
            style={[styles.input, { color: palette.ink, borderColor: palette.lineControl }]}
          />
        </View>
      </View>
    </View>
  )
}

export function RecipientPicker({
  visible,
  current,
  projects,
  onChoose,
  onClose,
}: {
  visible: boolean
  current: Destination | undefined
  projects: Theorem.Project[] | undefined
  onChoose: (destination: Destination) => void
  onClose: () => void
}) {
  const { palette } = useTheme()
  const machines = useComputers()
  return (
    <Modal visible={visible} presentationStyle="pageSheet" animationType="slide" onRequestClose={onClose}>
      <View style={[styles.sheet, { backgroundColor: palette.neutral }]}>
        <View style={styles.sheetHead}>
          <Text variant="title" accessibilityRole="header">
            Who receives this
          </Text>
          <Pressable accessibilityRole="button" onPress={onClose} hitSlop={12}>
            <Text variant="strong" tone="accent">
              Done
            </Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.group}>
            <Text variant="label" tone="muted" accessibilityRole="header" style={styles.groupHead}>
              THEO
            </Text>
            <View style={[styles.card, { backgroundColor: palette.raised, borderColor: palette.lineSeparator }]}>
              {projects?.length ? (
                projects.map((project) => {
                  const selected = current?.kind === 'theorem' && current.projectId === project.projectId
                  return (
                    <Row
                      key={project.projectId}
                      title="Theo"
                      detail={`In the project ${project.title}`}
                      selected={selected}
                      trailing={selected ? <Text tone="accent">✓</Text> : undefined}
                      onPress={() =>
                        onChoose({ kind: 'theorem', projectId: project.projectId, projectTitle: project.title })
                      }
                    />
                  )
                })
              ) : (
                <Row title="Theo" detail="Loading projects…" />
              )}
            </View>
          </View>

          {machines.status === 'unavailable' ? (
            <Text variant="label" tone="muted" style={styles.footnote}>
              Claude Code and Codex need a build with the native session feature.
            </Text>
          ) : (
            <>
              {machines.entries.map((entry) => (
                <ComputerOptions key={entry.computer.id} entry={entry} current={current} onChoose={onChoose} />
              ))}
              {machines.status === 'ready' && machines.entries.length === 0 ? (
                <Text variant="label" tone="muted" style={styles.footnote}>
                  Add a computer to talk to Claude Code or Codex running on it.
                </Text>
              ) : null}
              <View style={styles.footnote}>
                <Button
                  label="Add a computer"
                  onPress={() => {
                    onClose()
                    router.push('/computer')
                  }}
                />
              </View>
            </>
          )}
        </ScrollView>
      </View>
    </Modal>
  )
}

const styles = StyleSheet.create({
  sheet: { flex: 1 },
  sheetHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.sm,
  },
  scroll: { paddingBottom: space.xl * 2 },
  group: { marginTop: space.lg, marginHorizontal: space.lg, gap: space.sm },
  groupHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginLeft: space.sm },
  card: { borderRadius: radius.card, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  folder: { padding: space.lg, gap: space.xs },
  input: {
    minHeight: touchTarget,
    paddingHorizontal: space.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.control,
    fontFamily: fonts.code,
    ...typeScale.body,
  },
  footnote: { marginTop: space.lg, marginHorizontal: space.lg },
})
