// SOURCING: hand-rolled: a lookup over the chat.projects records the screen already loaded; no library models a remembered recipient
import type { Agent } from '../agents/shell'

/** Who receives a new conversation's first message. */
export type Destination =
  | { kind: 'theorem'; projectId: string; projectTitle: string }
  | { kind: 'agent'; agent: Agent; computerId: string; computerName: string; folder: string }

type Project = { projectId: string; title: string }

/**
 * Where a new conversation goes. The remembered choice is kept on the device,
 * not per account, so a Theorem project is used only while the signed-in
 * account still lists it; otherwise the first project stands in. Until the
 * projects are known there is no Theorem destination to send to.
 */
export function resolveDestination(
  remembered: Destination | undefined,
  projects: Project[] | undefined,
): Destination | undefined {
  if (remembered?.kind === 'agent') return remembered
  if (!projects) return undefined
  const project = projects.find((item) => item.projectId === remembered?.projectId) ?? projects[0]
  return project ? { kind: 'theorem', projectId: project.projectId, projectTitle: project.title } : undefined
}
