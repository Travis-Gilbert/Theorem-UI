// SOURCING: React Flow UI database-schema-node, copied by the shadcn CLI; reskinned to
// the canvas's tokens, with the body and cells taking class names and cell attributes.
import { BaseNode, BaseNodeContent } from '@/components/base-node'
import { TableBody, TableCell, TableRow } from '@/components/ui/table'
import { cn } from '@/lib/utils'
import type { ComponentProps, ReactNode } from 'react'

/** A container for the database schema node body that wraps the table. */
export const DatabaseSchemaNodeBody = ({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) => (
  <BaseNodeContent className={cn('p-0', className)}>
    <table className="w-full table-fixed overflow-visible">
      <TableBody>{children}</TableBody>
    </table>
  </BaseNodeContent>
)

/** A wrapper for individual table rows in the database schema node. */
export const DatabaseSchemaTableRow = ({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) => (
  <TableRow
    className={cn('relative border-0 text-xs hover:bg-transparent', className)}
  >
    {children}
  </TableRow>
)

/** A table cell for the database schema node. */
export const DatabaseSchemaTableCell = ({
  className,
  ...props
}: ComponentProps<typeof TableCell>) => (
  <TableCell className={cn('whitespace-normal', className)} {...props} />
)

/** The node itself: a BaseNode holding a header and a body. */
export const DatabaseSchemaNode = (props: ComponentProps<typeof BaseNode>) => (
  <BaseNode {...props} />
)
