// SOURCING: expo-widgets createLiveActivity (SDK 58; the layout runs in the widget extension's isolated runtime, so it uses nothing but its props, its environment and @expo/ui/swift-ui), @expo/ui/swift-ui HStack, VStack, Text, RoundedRectangle, Spacer and its modifiers
//
// Theo in the Dynamic Island and on the Lock Screen while a real task is under
// way (docs/plans/theo-iphone.md §2). It shows a pose, never the particles:
// the eye boxes are made by the app from Theo's core (features/theo/poses.ts)
// and arrive in the props. A Live Activity cannot fetch anything, so what it
// shows is what the app last told it; when that is old, it says so.
import { HStack, RoundedRectangle, Spacer, Text, VStack } from '@expo/ui/swift-ui'
import { font, foregroundStyle, frame, lineLimit, padding } from '@expo/ui/swift-ui/modifiers'
import { createLiveActivity, type LiveActivityEnvironment } from 'expo-widgets'

export type TaskActivityProps = {
  /** The task, as its owner titles it. */
  title: string
  /** One line from the work's owner: "Working", "Needs your choice". */
  status: string
  /** Where the work runs: "On Theorem", "On Studio Mac". */
  where: string
  needsYou: boolean
  /** Eye boxes in units of the face's height, left to right. */
  eyes: { w: number; h: number; r: number }[]
}

const TaskActivity = (props: TaskActivityProps, environment: LiveActivityEnvironment) => {
  'widget'
  const ink = environment.isLuminanceReduced ? '#FFFFFF' : props.needsYou ? '#F2C94C' : '#7FD4FF'
  // What the phone last heard. The system marks it stale when the app has not confirmed it in time.
  const status = environment.isStale ? `Last known: ${props.status}` : props.status
  const eyes = (unit: number) => (
    <HStack spacing={unit * 0.28} alignment="center">
      {props.eyes.map((eye, index) => (
        <RoundedRectangle
          key={index}
          cornerRadius={eye.r * unit}
          modifiers={[
            foregroundStyle(ink),
            frame({ width: Math.max(2, eye.w * unit), height: Math.max(2, eye.h * unit) }),
          ]}
        />
      ))}
    </HStack>
  )
  const lines = (
    <VStack alignment="leading" spacing={2}>
      <Text modifiers={[font({ weight: 'semibold', size: 15 }), lineLimit(1)]}>{props.title}</Text>
      <Text modifiers={[font({ size: 13 }), foregroundStyle(ink), lineLimit(1)]}>{status}</Text>
      <Text modifiers={[font({ size: 12 }), foregroundStyle('#9AA0A6'), lineLimit(1)]}>{props.where}</Text>
    </VStack>
  )
  return {
    banner: (
      <HStack spacing={14} alignment="center" modifiers={[padding({ all: 14 })]}>
        {eyes(34)}
        {lines}
        <Spacer />
      </HStack>
    ),
    compactLeading: eyes(18),
    compactTrailing: (
      <Text modifiers={[font({ size: 12, weight: 'medium' }), foregroundStyle(ink), lineLimit(1)]}>
        {props.needsYou ? 'Needs you' : status}
      </Text>
    ),
    minimal: eyes(14),
    expandedLeading: <VStack modifiers={[padding({ all: 8 })]}>{eyes(30)}</VStack>,
    expandedCenter: lines,
  }
}

export default createLiveActivity('TheoTask', TaskActivity)
