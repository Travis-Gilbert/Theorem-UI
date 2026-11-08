// SOURCING: React Flow UI base-handle, copied by the shadcn CLI (ui.reactflow.dev/base-handle).
import type { ComponentProps } from 'react'
import { Handle } from '@xyflow/react'
import type { HandleProps } from '@xyflow/react'

import { cn } from '@/lib/utils'

export type BaseHandleProps = HandleProps

export function BaseHandle({
  className,
  children,
  ...props
}: ComponentProps<typeof Handle>) {
  return (
    <Handle
      {...props}
      className={cn(
        'dark:border-secondary dark:bg-secondary h-[11px] w-[11px] rounded-full border border-slate-300 bg-slate-100 transition',
        className,
      )}
    >
      {children}
    </Handle>
  )
}
