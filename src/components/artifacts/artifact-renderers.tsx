// SOURCING: react-markdown + remark-gfm + @tailwindcss/typography (documents), the installed react-shiki SyntaxHighlighter (code), the installed beautiful-mermaid MermaidDiagram (diagrams)
//
// Renderers are chosen by the part's rendererId. Anything without a renderer
// gets a named fallback that says what it is and shows the part's fallbackText;
// artifacts are declarative text, so nothing here executes artifact content.
import { isValidElement } from 'react'
import type { FC, ReactElement, ReactNode } from 'react'
import Markdown from 'react-markdown'
import type { Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidDiagram } from '@/components/assistant-ui/elements/mermaid-diagram'
import { SyntaxHighlighter } from '@/components/assistant-ui/elements/shiki-highlighter'
import { cn } from '@/lib/utils'
import type { TheoremArtifact } from './artifact-model'

type RendererProps = { artifact: TheoremArtifact }

const codeSurface =
  '[&_pre]:rounded-lg! [&_pre]:border! [&_pre]:border-separator! [&_pre]:bg-raised!'

/** A fenced block inside a document: the child of <pre> is <code class="language-x">. */
function fencedCode(
  children: ReactNode,
): { language: string; code: string } | undefined {
  if (!isValidElement(children)) return undefined
  const props = (
    children as ReactElement<{ className?: string; children?: ReactNode }>
  ).props
  const language =
    /language-([\w-]+)/.exec(props.className ?? '')?.[1] ?? 'text'
  const code = typeof props.children === 'string' ? props.children : undefined
  return code === undefined ? undefined : { language, code }
}

const documentComponents: Components = {
  pre({ children }) {
    const block = fencedCode(children)
    if (!block) return <pre>{children}</pre>
    if (block.language === 'mermaid')
      return (
        <div className="not-prose my-4">
          <MermaidDiagram code={block.code} className="rounded-lg" />
        </div>
      )
    return (
      <SyntaxHighlighter
        className={cn('not-prose my-4', codeSurface)}
        language={block.language}
        code={block.code}
      />
    )
  },
}

/** Markdown as Theorem documents read, in artifacts and the Index alike. */
export const MarkdownDocument: FC<{ content: string; className?: string }> = ({
  content,
  className,
}) => (
  <article
    className={cn(
      'prose prose-theorem max-w-none text-base leading-6',
      className,
    )}
  >
    <Markdown remarkPlugins={[remarkGfm]} components={documentComponents}>
      {content}
    </Markdown>
  </article>
)

const DocumentArtifact: FC<RendererProps> = ({ artifact }) => (
  <MarkdownDocument content={artifact.content} />
)

const CodeArtifact: FC<RendererProps> = ({ artifact }) => (
  <SyntaxHighlighter
    className={cn('[&_pre]:text-[13px]', codeSurface)}
    language={artifact.language ?? 'text'}
    code={artifact.content}
  />
)

const DiagramArtifact: FC<RendererProps> = ({ artifact }) => (
  <MermaidDiagram code={artifact.content} className="rounded-lg bg-raised" />
)

const RENDERERS: Record<string, FC<RendererProps>> = {
  'theorem-document': DocumentArtifact,
  'theorem-code': CodeArtifact,
  'theorem-diagram': DiagramArtifact,
}

export function hasRenderer(artifact: TheoremArtifact): boolean {
  return artifact.rendererId in RENDERERS
}

/** Named fallback: says which renderer is missing and shows the part's text summary. */
const UnsupportedArtifact: FC<RendererProps> = ({ artifact }) => (
  <div className="flex flex-col gap-3">
    <p className="text-sm text-ink-muted">
      Theorem UI has no renderer for{' '}
      <span className="font-mono text-[13px] text-ink">
        {artifact.rendererId}
      </span>{' '}
      ({artifact.kind}, {artifact.contractVersion}). Showing its text summary.
    </p>
    <p className="whitespace-pre-wrap rounded-lg border border-separator bg-raised p-4 text-sm leading-6">
      {artifact.fallbackText}
    </p>
  </div>
)

export const ArtifactBody: FC<RendererProps> = ({ artifact }) => {
  const Renderer = RENDERERS[artifact.rendererId] ?? UnsupportedArtifact
  return <Renderer artifact={artifact} />
}
