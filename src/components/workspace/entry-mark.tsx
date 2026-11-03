// SOURCING: the app's Icon registry. A lookup from where a workspace entry
// comes from to the mark and the words that say so; nothing to source.
import { Icon } from '@/components/icons'
import type { TheoremSource } from '@/lib/workspace/types'

type Mark = (typeof Icon)[keyof typeof Icon]

/**
 * The mark for a file and what it is, when Theorem holds it as more than a
 * file: a document, an agent's document, a skill or a plan. Null for a plain
 * file, which takes the tree's file mark.
 */
export function theoremMark(
  source: TheoremSource | undefined,
): { Mark: Mark; label: string } | null {
  if (!source || source.backing === 'agentfs') return null
  const readOnly = source.readOnly ? ' · read-only' : ''
  if (source.backing === 'plan')
    return {
      Mark: Icon.Plan,
      label: `Theorem plan${source.planStatus ? ` · ${source.planStatus}` : ''}${readOnly}`,
    }
  if (source.agent)
    return { Mark: Icon.Agent, label: `Written by an agent${readOnly}` }
  if (source.documentKind === 'skill')
    return { Mark: Icon.Skill, label: `Theorem skill${readOnly}` }
  return { Mark: Icon.Article, label: `Theorem document${readOnly}` }
}
