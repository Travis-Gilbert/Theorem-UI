// SOURCING: coss ui Badge (the marks keys.tsx puts beside a key's name)
import { Badge } from '@/components/coss/badge'
import type { ShippedInfo } from '@/lib/theorem/response-styles'

type Marked = {
  origin: 'shipped' | 'user'
  revision: number
  shipped: ShippedInfo | null
}

/** Whose it is, whether the person changed a shipped one, and whether Theorem has since changed it too. */
export function ResourceMarks({ resource }: { resource: Marked }) {
  const edited = resource.origin === 'shipped' && resource.revision > 0
  return (
    <>
      <Badge variant={resource.origin === 'shipped' ? 'outline' : 'secondary'}>
        {resource.origin === 'shipped' ? 'Shipped' : 'Yours'}
      </Badge>
      {edited && <Badge variant="info">Edited</Badge>}
      {resource.shipped?.updateAvailable && (
        <Badge variant="warning">Update available</Badge>
      )}
    </>
  )
}
