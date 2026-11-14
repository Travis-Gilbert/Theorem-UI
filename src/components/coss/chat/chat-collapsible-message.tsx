// SOURCING: coss ui chat chat-collapsible-message (vendored as-is from https://coss.com/ui/r/chat.json; registry imports point at this folder)
import { ChevronDownIcon, ChevronUpIcon } from "lucide-react";
import type { ReactElement, ReactNode } from "react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { appearancePair } from "@/lib/appearance-policy";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/coss/collapsible";
import { splitChatMessagePreview } from "./lib/split-chat-message-preview";

export type ChatCollapsibleMessageProps = {
  text: string;
  showMoreLabel: string;
  showLessLabel: string;
  side: "incoming" | "outgoing";
  maxPreviewLength?: number;
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  renderText?: (text: string) => ReactNode;
  className?: string;
};

function renderPlainText(text: string): ReactElement {
  return (
    <p className="m-0 whitespace-pre-wrap break-words text-sm leading-[1.55]">
      {text}
    </p>
  );
}

function ChatCollapsibleMessage({
  text,
  showMoreLabel,
  showLessLabel,
  side,
  maxPreviewLength,
  defaultOpen = false,
  open,
  onOpenChange,
  renderText = renderPlainText,
  className,
}: ChatCollapsibleMessageProps): ReactElement {
  const { preview, remainder } = splitChatMessagePreview(
    text,
    maxPreviewLength,
  );
  if (!remainder) {
    return <div className={cn("min-w-0", className)}>{renderText(text)}</div>;
  }

  return (
    <ExpandableChatMessage
      text={text}
      preview={preview}
      renderText={renderText}
      showMoreLabel={showMoreLabel}
      showLessLabel={showLessLabel}
      side={side}
      className={className}
      defaultOpen={defaultOpen}
      open={open}
      onOpenChange={onOpenChange}
    />
  );
}

function ExpandableChatMessage({
  text,
  preview,
  renderText,
  showMoreLabel,
  showLessLabel,
  side,
  className,
  defaultOpen,
  open: controlledOpen,
  onOpenChange,
}: {
  text: string;
  preview: string;
  renderText: (text: string) => ReactNode;
  showMoreLabel: string;
  showLessLabel: string;
  side: "incoming" | "outgoing";
  className?: string;
  defaultOpen: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}): ReactElement {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (nextOpen: boolean): void => {
    if (controlledOpen === undefined) setInternalOpen(nextOpen);
    onOpenChange?.(nextOpen);
  };
  const Icon = open ? ChevronUpIcon : ChevronDownIcon;

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className={cn("flex min-w-0 flex-col", className)}
    >
      <div className="grid">
        <div
          data-slot="chat-collapsible-preview"
          data-appearance-part="preview"
          {...appearancePair('primary', side === 'outgoing' ? 'user-message' : 'assistant-reading')}
          aria-hidden={open || undefined}
          inert={open || undefined}
          className={cn(
            "col-start-1 row-start-1 self-start",
            open && "invisible",
          )}
        >
          {renderText(preview)}
        </div>
        <CollapsiblePanel className="col-start-1 row-start-1 min-w-0 motion-reduce:transition-none">
          <div
            aria-hidden={!open || undefined}
            inert={!open || undefined}
            className={open ? undefined : "invisible"}
          >
            {renderText(text)}
          </div>
        </CollapsiblePanel>
      </div>
      <CollapsibleTrigger
        type="button"
        data-appearance-recipe="ui.label"
        {...appearancePair('secondary', side === 'outgoing' ? 'user-message' : 'assistant-reading')}
        className={cn(
          "mt-2 flex min-h-6 w-fit items-center gap-1 text-start outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
          side === "outgoing"
            ? "text-muted-foreground hover:text-foreground"
            : "text-muted-foreground hover:text-foreground",
        )}
      >
        {open ? showLessLabel : showMoreLabel}
        <Icon aria-hidden="true" className="size-3.5 shrink-0" />
      </CollapsibleTrigger>
    </Collapsible>
  );
}

export { ChatCollapsibleMessage, splitChatMessagePreview };
