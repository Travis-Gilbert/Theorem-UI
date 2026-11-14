"use client";

import "@assistant-ui/react-markdown/styles/dot.css";

import {
  MarkdownTextPrimitive,
  memoizeMarkdownComponents,
  useIsMarkdownCodeBlock
} from "@assistant-ui/react-markdown";
import type { CodeHeaderProps, MarkdownTextPrimitiveProps } from "@assistant-ui/react-markdown";
import remarkGfm from "remark-gfm";
import { memo, useMemo, useRef } from "react";
import type { FC } from "react";
import type { TextMessagePartProps } from "@assistant-ui/react";

import { MermaidDiagram } from "@/components/assistant-ui/elements/mermaid-diagram.aui";
import { SyntaxHighlighter } from "@/components/assistant-ui/elements/shiki-highlighter.aui";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import { Icon } from "@/components/icons";
import { useCopyToClipboard } from "@/hooks/use-copy-to-clipboard";
import { cn } from "@/lib/utils";
import { appearancePair } from "@/lib/appearance-policy";

type MarkdownTextProps = Partial<TextMessagePartProps> & {
  components?: Parameters<typeof memoizeMarkdownComponents>[0];
  componentsByLanguage?: MarkdownTextPrimitiveProps["componentsByLanguage"];
};

const useShallowStable = <T extends Record<string, unknown> | undefined>(
  value: T,
): T => {
  const ref = useRef(value);
  if (value !== ref.current) {
    const prev = ref.current;
    const stable =
      value !== undefined &&
      prev !== undefined &&
      Object.keys(prev).length === Object.keys(value).length &&
      Object.keys(value).every((key) => prev[key] === value[key]);
    if (!stable) ref.current = value;
  }
  return ref.current;
};

// Fenced mermaid blocks render as diagrams; every other fence goes through Shiki.
const defaultComponentsByLanguage: MarkdownTextPrimitiveProps["componentsByLanguage"] = {
  mermaid: { SyntaxHighlighter: MermaidDiagram },
};

const MarkdownTextImpl: FC<MarkdownTextProps> = ({
  components,
  componentsByLanguage,
}) => {
  const stableComponents = useShallowStable(components);
  const stableComponentsByLanguage = useShallowStable(componentsByLanguage);
  const markdownComponents = useMemo(() => {
    if (!stableComponents) return defaultComponents;
    return {
      ...defaultComponents,
      ...memoizeMarkdownComponents(stableComponents),
    };
  }, [stableComponents]);

  return (
    <MarkdownTextPrimitive
      remarkPlugins={[remarkGfm]}
      className="aui-md"
      components={markdownComponents}
      componentsByLanguage={stableComponentsByLanguage ?? defaultComponentsByLanguage}
      defer
    />
  );
};

export const MarkdownText = memo(MarkdownTextImpl);

export const CodeHeader: FC<CodeHeaderProps> = ({ language, code }) => {
  const { isCopied, copyToClipboard } = useCopyToClipboard();
  const onCopy = () => {
    if (!code || isCopied) return;
    copyToClipboard(code);
  };

  return (
    <div className="aui-code-header-root border-separator bg-raised mt-3 flex items-center justify-between rounded-t-lg border border-b-0 py-1 ps-3.5 pe-1 text-xs">
      <span data-appearance-recipe="metadata" {...appearancePair("secondary", "popover")} className="aui-code-header-language text-ink-muted lowercase">
        {language}
      </span>
      <TooltipIconButton tooltip="Copy" onClick={onCopy}>
        {!isCopied && (
          <Icon.Copy className="animate-in fade-in zoom-in-75" />
        )}
        {isCopied && (
          <Icon.Copied className="animate-in fade-in zoom-in-30 -spin-in-20 ease-lift duration-(--duration-lift)" />
        )}
      </TooltipIconButton>
    </div>
  );
};

const defaultComponents = memoizeMarkdownComponents({
  SyntaxHighlighter,
  h1: ({ className, ...props }) => (
    <h1
      data-appearance-recipe="heading.large"
      className={cn(
        "aui-md-h1",
        className,
      )}
      {...props}
    />
  ),
  h2: ({ className, ...props }) => (
    <h2
      data-appearance-recipe="heading.medium"
      className={cn(
        "aui-md-h2",
        className,
      )}
      {...props}
    />
  ),
  h3: ({ className, ...props }) => (
    <h3
      data-appearance-recipe="heading.small"
      className={cn(
        "aui-md-h3",
        className,
      )}
      {...props}
    />
  ),
  h4: ({ className, ...props }) => (
    <h4
      data-appearance-recipe="heading.small"
      className={cn(
        "aui-md-h4",
        className,
      )}
      {...props}
    />
  ),
  h5: ({ className, ...props }) => (
    <h5
      data-appearance-recipe="heading.small"
      className={cn(
        "aui-md-h5",
        className,
      )}
      {...props}
    />
  ),
  h6: ({ className, ...props }) => (
    <h6
      data-appearance-recipe="heading.small"
      className={cn(
        "aui-md-h6",
        className,
      )}
      {...props}
    />
  ),
  p: ({ className, ...props }) => (
    <p
      data-appearance-recipe="prose"
      data-appearance-part="prose-block"
      {...appearancePair("primary", "assistant-reading")}
      className={cn(
        "aui-md-p",
        className,
      )}
      {...props}
    />
  ),
  a: ({ className, ...props }) => (
    <a
      {...appearancePair("link", "assistant-reading")}
      className={cn(
        "aui-md-a text-link decoration-link/40 hover:decoration-link underline underline-offset-2",
        className,
      )}
      {...props}
    />
  ),
  blockquote: ({ className, ...props }) => (
    <blockquote
      className={cn(
        "aui-md-blockquote border-separator text-ink-muted my-3 border-s-2 ps-4",
        className,
      )}
      {...props}
    />
  ),
  ul: ({ className, ...props }) => (
    <ul
      className={cn(
        "aui-md-ul marker:text-ink-faint my-3 ms-5 list-disc [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  ol: ({ className, ...props }) => (
    <ol
      className={cn(
        "aui-md-ol marker:text-ink-faint my-3 ms-5 list-decimal [&>li]:mt-1",
        className,
      )}
      {...props}
    />
  ),
  hr: ({ className, ...props }) => (
    <hr
      className={cn("aui-md-hr border-separator my-5", className)}
      {...props}
    />
  ),
  table: ({ className, ...props }) => (
    <div className="aui-md-table-wrapper my-3 overflow-x-auto">
      <table
        className={cn(
          "aui-md-table w-full border-separate border-spacing-0",
          className,
        )}
        {...props}
      />
    </div>
  ),
  th: ({ className, ...props }) => (
    <th
      className={cn(
        "aui-md-th bg-raised border-control border-b px-3 py-1.5 text-start font-medium first:rounded-ss-lg last:rounded-se-lg [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  td: ({ className, ...props }) => (
    <td
      className={cn(
        "aui-md-td border-separator border-b px-3 py-1.5 text-start last:border-e [[align=center]]:text-center [[align=right]]:text-right",
        className,
      )}
      {...props}
    />
  ),
  tr: ({ className, ...props }) => (
    <tr
      className={cn(
        "aui-md-tr m-0 border-b p-0 first:border-t [&:last-child>td:first-child]:rounded-es-lg [&:last-child>td:last-child]:rounded-ee-lg",
        className,
      )}
      {...props}
    />
  ),
  li: ({ className, ...props }) => (
    <li className={cn("aui-md-li leading-6", className)} {...props} />
  ),
  strong: ({ className, ...props }) => (
    <strong
      className={cn("aui-md-strong font-semibold", className)}
      {...props}
    />
  ),
  sup: ({ className, ...props }) => (
    <sup
      className={cn("aui-md-sup [&>a]:text-xs [&>a]:no-underline", className)}
      {...props}
    />
  ),
  pre: ({ className, ...props }) => (
    <pre
      data-appearance-recipe="code"
      className={cn(
        "aui-md-pre border-separator bg-popover overflow-x-auto rounded-t-none rounded-b-lg border border-t-0 p-3.5 text-[13px] leading-relaxed",
        className,
      )}
      {...props}
    />
  ),
  code: function Code({ className, ...props }) {
    const isCodeBlock = useIsMarkdownCodeBlock();
    return (
      <code
        data-appearance-recipe="code"
        {...appearancePair("code", "popover")}
        className={cn(
          !isCodeBlock &&
            "aui-md-inline-code text-ink bg-popover border-separator rounded-sm border px-1 py-px font-mono text-[0.85em]",
          className,
        )}
        {...props}
      />
    );
  },
  CodeHeader,
});
