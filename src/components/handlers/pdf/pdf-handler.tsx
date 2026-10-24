// SOURCING: react-pdf (pdf.js's Document and Page as React components, with
// its text and annotation layers) over pdfjs-dist, and TanStack Virtual (only
// the pages in view are drawn, each page measured once drawn). The worker is
// set as react-pdf's README says, in this module. react-pdf copies the bytes
// before pdf.js takes them over, so the query cache's copy stays whole.
import { useVirtualizer } from '@tanstack/react-virtual'
import { useMemo, useRef, useState } from 'react'
import { Document, Page, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import 'react-pdf/dist/Page/TextLayer.css'
import { useFileBytes } from '@/lib/handlers/file-sync'
import type { FileRef } from '@/lib/handlers/file-sync'
import type { FileCardProps, FileViewProps } from '@/lib/handlers/types'
import { FileMessage } from '../file-status'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString()

/** The file as react-pdf takes it, or the message to show instead. */
function usePdf(file: FileRef) {
  const bytes = useFileBytes(file)
  const data = bytes.data?.bytes
  // react-pdf reloads when `file` is a new object.
  const source = useMemo(() => data && { data }, [data])
  if (bytes.isError) return { message: 'This file could not be read.' }
  if (!source) return { message: 'Loading…' }
  return { source }
}

const NOT_A_PDF = 'This file is not a PDF that can be shown.'

/** Space around and between pages, in pixels. */
const GAP = 16
/** A US Letter page, until a page is drawn and measured. */
const PAGE_RATIO = 11 / 8.5

function Pages({ count }: { count: number }) {
  const scroller = useRef<HTMLDivElement>(null)
  const virtualizer = useVirtualizer({
    count,
    getScrollElement: () => scroller.current,
    estimateSize: () =>
      ((scroller.current?.clientWidth ?? 600) - 2 * GAP) * PAGE_RATIO,
    overscan: 1,
    gap: GAP,
    paddingStart: GAP,
    paddingEnd: GAP,
  })
  const width = (virtualizer.scrollRect?.width ?? 0) - 2 * GAP
  return (
    <div ref={scroller} className="h-full overflow-auto bg-frame">
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {width > 0 &&
          virtualizer.getVirtualItems().map((item) => (
            <div
              key={item.key}
              ref={virtualizer.measureElement}
              data-index={item.index}
              className="absolute inset-x-0 flex justify-center"
              style={{ transform: `translateY(${item.start}px)` }}
            >
              <Page
                pageNumber={item.index + 1}
                width={width}
                className="shadow-sm"
              />
            </div>
          ))}
      </div>
    </div>
  )
}

export function PdfPanel(file: FileViewProps) {
  const pdf = usePdf(file)
  const [count, setCount] = useState<number>()
  if (!pdf.source) return <FileMessage>{pdf.message}</FileMessage>
  return (
    <Document
      file={pdf.source}
      suspense={false}
      loading={<FileMessage>Loading…</FileMessage>}
      error={<FileMessage>{NOT_A_PDF}</FileMessage>}
      onLoadSuccess={(doc) => setCount(doc.numPages)}
      className="flex h-full min-h-0 flex-col"
    >
      {count !== undefined && (
        <>
          <div className="flex h-8 shrink-0 items-center border-b border-separator px-3 text-xs text-ink-faint">
            {count} {count === 1 ? 'page' : 'pages'}
          </div>
          <div className="min-h-0 flex-1">
            <Pages count={count} />
          </div>
        </>
      )}
    </Document>
  )
}

/** Drawn this wide, then scaled to the card. */
const CARD_PAGE_WIDTH = 480

/** The first page, without its text or links. */
export function PdfCard({ client, path }: FileCardProps) {
  const pdf = usePdf({ client, path })
  if (!pdf.source)
    return <FileMessage className="text-xs">{pdf.message}</FileMessage>
  return (
    <Document
      file={pdf.source}
      suspense={false}
      loading={<FileMessage className="text-xs">Loading…</FileMessage>}
      error={<FileMessage className="text-xs">{NOT_A_PDF}</FileMessage>}
      className="h-full overflow-hidden bg-white"
    >
      <Page
        pageNumber={1}
        width={CARD_PAGE_WIDTH}
        renderTextLayer={false}
        renderAnnotationLayer={false}
        className="[&_canvas]:h-auto! [&_canvas]:w-full!"
      />
    </Document>
  )
}
