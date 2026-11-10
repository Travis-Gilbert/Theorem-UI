// SOURCING: the rail's Streamline PNGs split into outline, accent, tint and paper masks by scripts/rail-icons.mjs, painted as CSS masks (.icon-mask) in colours the theme around them derives (.rail-mark in styles.css: CSS relative colors over the accent, no script)
import type { FC } from 'react'
import { RAIL_LAYERS } from '@/assets/icons/streamline/rail/layers'
import type { RailIcon } from '@/assets/icons/streamline/rail/layers'
import { painted } from '@/components/icons'
import { cn } from '@/lib/utils'
import { RAIL_SHIFT } from './rail-wheel'

type Props = { className?: string }

/**
 * A rail icon as stacked masks: the outline in ink, the accent in the icon's
 * turn of the theme's accent, and the tint and paper as that colour taken
 * toward the rail's ground. It rests a little quieter and comes up to full
 * colour under the enclosing `group/rail` button's hover, current page or
 * pressed state.
 */
function railMark(name: RailIcon): FC<Props> {
  const Mark = painted(RAIL_LAYERS[name], RAIL_SHIFT[name])
  return function RailMark({ className }) {
    return (
      <Mark
        className={cn(
          'opacity-75 group-hover/rail:opacity-100 group-aria-[current=page]/rail:opacity-100 group-aria-pressed/rail:opacity-100',
          className,
        )}
      />
    )
  }
}

export const RailMark = {
  Home: railMark('home'),
  Index: railMark('index'),
  Notes: railMark('notes'),
  Pages: railMark('pages'),
  Spaces: railMark('spaces'),
  Canvas: railMark('canvas'),
  Ide: railMark('ide'),
  Vault: railMark('vault'),
  Files: railMark('files'),
}
