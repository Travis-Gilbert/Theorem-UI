"use client";

import { ToastProvider, toastManager } from "@/components/coss/toast";
import { ProjectContextChip } from "@/components/organize/thread-header";
import { ThreadReviewCards } from "@/components/review/review-card";
import {
  ComposerAddAttachment,
  ComposerAttachments,
  UserMessageAttachments,
} from "@/components/assistant-ui/elements/attachment.aui";
import { File, getFileHref } from "@/components/assistant-ui/elements/file";
import { Image } from "@/components/assistant-ui/elements/image";
import { MarkdownText } from "@/components/assistant-ui/elements/markdown-text";
import {
  Reasoning,
  ReasoningContent,
  ReasoningRoot,
  ReasoningText,
  ReasoningTrigger,
} from "@/components/assistant-ui/elements/reasoning.aui";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import {
  isStandaloneToolCall,
  RunningIndicator,
  TheoremToolCall,
  RunSummary,
} from "@/components/chat/theorem-parts";
import { ModelPicker } from "@/components/chat/model-picker";
import { Icon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  ActionBarMorePrimitive,
  ActionBarPrimitive,
  AuiIf,
  BranchPickerPrimitive,
  ComposerPrimitive,
  ErrorPrimitive,
  groupPartByType,
  MessagePrimitive,
  ThreadPrimitive,
  useAui,
  useAuiEvent,
  useAuiState,
} from "@assistant-ui/react";
import type { AssistantState, FileMessagePartComponent, ImageMessagePartComponent, TextMessagePartComponent, ToolCallMessagePartComponent } from "@assistant-ui/react";
import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ComponentType, FC, PropsWithChildren, ReactNode } from "react";
import {
  Collapsible,
  CollapsiblePanel,
  CollapsibleTrigger,
} from "@/components/coss/collapsible";
import { ProjectGlyph } from "@/components/organize/glyphs";
import { ChevronRight } from "lucide-react";

import { Magnet, useArrivedLive } from "@/components/motion";
import { flyFrom, kick, recordLaunch, takeLaunch } from "@/lib/motion";

import { ComposerReferences } from "@/components/chat/composer-references";
import { SCENE_PART } from "@/components/chat/scene-model";
import { answerBody } from "@/lib/theorem/reviews";
import { useStartThreadFrom } from "@/lib/theorem/thread-tree";

import { hasTheoremError } from "@/lib/theorem/message-history";

import { useComposerSend } from "@assistant-ui/core/react";
import { COMPOSER_TOOLTIP_DELAY, ComposerPlanToggle, ComposerToolTrigger, ComposerWebToggle } from "@/components/chat/composer-tools";
import { EffortPicker } from "@/components/chat/effort-picker";
import { StylePicker } from "@/components/chat/style-picker";
import { ResponseDetailsDialog, ResponseDetailsItem } from "@/components/chat/response-style-details";
import { DirectiveText } from "./directive-text.aui";
import { ChatCollapsibleMessage } from "@/components/coss/chat/chat-collapsible-message";
import { UnseenDivider, UnseenFromProvider, useUnseenFrom } from "./unseen-divider.aui";
import { attendKit } from "@/lib/kit/store";
import { messageLabel, messageSurface } from "@/lib/kit/stage";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

const shouldShowComposerResume = (s: AssistantState) =>
  !!s.thread.canResume && s.composer.type === "thread" && s.composer.isEmpty;

const reasoningDuration = (timing: ThreadGroupPart["timing"]) =>
  timing?.completedAt === undefined
    ? undefined
    : Math.round((timing.completedAt - timing.startedAt) / 1000);

/**
 * Optional component overrides for the thread. `AssistantMessage` replaces
 * the whole message; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`. Without `ToolGroup`, grouped tool calls draw no row of
 * their own and fold into the settled run's summary line (`RunSummary`).
 * When `TaskGroup` is set, tool calls that carry a nested
 * conversation and have no registered UI render through it instead of the
 * tool group; without it they render like any other tool call.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  ToolFallback?: ToolCallMessagePartComponent | undefined;
  ToolGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
  ReasoningGroup?:
    | ComponentType<PropsWithChildren<{ group: ThreadGroupPart }>>
    | undefined;
  TaskGroup?: ComponentType<{ group: ThreadGroupPart }> | undefined;
};

const defaultGroupBy = groupPartByType({
  reasoning: ["group-chainOfThought", "group-reasoning"],
  "tool-call": ["group-chainOfThought", "group-tool"],
  "standalone-tool-call": [],
});

// Theorem: artifact tools and pending approvals render outside the tool group.
const messageGroupBy: typeof defaultGroupBy = (part, context) =>
  isStandaloneToolCall(part) ? [] : defaultGroupBy(part, context);

type ThreadGroupKey =
  | "group-chainOfThought"
  | "group-reasoning"
  | "group-tool"
  | "group-task";

const TASK_GROUP_PATH: readonly ThreadGroupKey[] = [
  "group-chainOfThought",
  "group-task",
];

const taskAwareGroupBy = (
  part: Parameters<typeof messageGroupBy>[0],
  context?: Parameters<typeof messageGroupBy>[1],
): readonly ThreadGroupKey[] => {
  const path = messageGroupBy(part, context);
  return part.type === "tool-call" &&
    part.messages !== undefined &&
    path.length > 0 &&
    !context?.toolUIs?.[part.toolName]?.length
    ? TASK_GROUP_PATH
    : path;
};

export type ThreadProps = {
  components?: ThreadComponents | undefined;
  autoFocus?: boolean | undefined;
  /** Another view lies over the thread while it stays laid out, as Theia and the Vault do on the desktop. */
  covered?: boolean | undefined;
};

const EMPTY_COMPONENTS: ThreadComponents = {};

const ThreadComponentsContext =
  createContext<ThreadComponents>(EMPTY_COMPONENTS);

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not welcome.
const isHistoryLoadingView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  s.thread.isLoading &&
  !s.thread.isDisabled &&
  !s.threads.isLoading;

const ThreadHistorySkeleton: FC = () => (
  <div
    data-slot="aui_thread-history-skeleton"
    role="status"
    className="animate-in fade-in fill-mode-both flex flex-col gap-y-6 [animation-delay:150ms] [animation-duration:200ms]"
  >
    <span className="sr-only">Loading conversation</span>
    <Skeleton className="h-9 w-2/5 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
    </div>
    <Skeleton className="h-9 w-1/3 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-10/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
    </div>
  </div>
);

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  autoFocus = true,
  covered = false,
}) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadRoot isEmpty={isEmpty} autoFocus={autoFocus} covered={covered} />
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{
  isEmpty: boolean;
  autoFocus: boolean;
  covered: boolean;
}> = ({ isEmpty, autoFocus, covered }) => {
  const footerRef = useRef<HTMLDivElement>(null);
  const unseen = useUnseenFrom(covered);
  // The first send hands the composer from the middle of the page down to
  // the bottom, on a spring rather than a jump. It lands against the bottom
  // edge, so it glides rather than overshooting past it.
  useLayoutEffect(() => {
    const origin = takeLaunch("composer-dock");
    if (!isEmpty && origin && footerRef.current)
      flyFrom(footerRef.current, origin, { fade: false, ease: "glide" });
  }, [isEmpty]);

  return (
    <ThreadPrimitive.Root
      className="aui-root aui-thread-root @container flex h-full flex-col"
      style={{
        // The reading measure is the text's width; the column's side padding sits outside it.
        ["--thread-max-width" as string]: "calc(var(--spacing-reading) + 2rem)",
        ["--composer-bg" as string]: "var(--surface-composer)",
        ["--composer-radius" as string]: "var(--radius-2xl)",
        ["--composer-padding" as string]: "12px",
      }}
    >
      <ThreadPrimitive.Viewport
        ref={unseen.ref}
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        data-kit-clip
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4",
            isEmpty && "justify-center",
          )}
        >
          <AuiIf condition={isHistoryLoadingView}>
            <ThreadHistorySkeleton />
          </AuiIf>

          <ProjectContextChip />

          <ThreadLoadEarlier />

          <div
            data-slot="aui_message-group"
            className="mb-14 flex flex-col gap-y-6 empty:hidden"
          >
            <UnseenFromProvider value={unseen.anchor}>
              <ThreadPrimitive.Messages>
                {() => <ThreadMessage />}
              </ThreadPrimitive.Messages>
            </UnseenFromProvider>
          </div>

          <ThreadReviewCards />

          <ThreadPrimitive.ViewportFooter
            ref={footerRef}
            className={cn(
              "aui-thread-viewport-footer flex flex-col gap-4 overflow-visible pb-4 md:pb-6",
              // Pinned to the sheet's bottom edge, it covers the messages
              // scrolling under it with the stretch of gradient it sits on.
              !isEmpty &&
                "bg-sheet sticky bottom-0 mt-auto rounded-t-(--composer-radius) bg-bottom",
            )}
          >
            <ThreadScrollToBottom />
            <Composer autoFocus={autoFocus} />
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

const ThreadMessage: FC = () => {
  const { AssistantMessage: AssistantMessageComponent = AssistantMessage } =
    useContext(ThreadComponentsContext);
  const role = useAuiState((s) => s.message.role);
  const isEditing = useAuiState((s) => s.message.composer.isEditing);
  const isSpoken = useAuiState((s) => s.message.metadata.modality === "voice");

  if (isEditing) return <EditComposer />;
  if (isSpoken) return <SpokenMessage />;
  if (role === "user") return <UserMessage />;
  return (
    <>
      <UnseenDivider />
      <AssistantMessageComponent />
    </>
  );
};

type VoiceRunPosition = "single" | "start" | "middle" | "end";

const useVoiceRunPosition = (): VoiceRunPosition =>
  useAuiState((s) => {
    const before =
      s.thread.messages[s.message.index - 1]?.metadata.modality === "voice";
    const after =
      s.thread.messages[s.message.index + 1]?.metadata.modality === "voice";
    if (before) return after ? "middle" : "end";
    return after ? "start" : "single";
  });

const SpokenText: TextMessagePartComponent = ({ text }) => (
  <p className="aui-spoken-message-text m-0">{text}</p>
);

const SpokenMessage: FC = () => {
  const role = useAuiState((s) => s.message.role);
  const position = useVoiceRunPosition();
  const isSpeaking = useAuiState(
    (s) =>
      s.message.role === "assistant" && s.message.status?.type === "running",
  );
  const opensExchange = position === "start" || position === "single";

  return (
    <MessagePrimitive.Root
      data-slot="aui_spoken-message-root"
      data-role={role}
      data-voice-run={position}
      className={cn(
        "aui-spoken-message bg-muted/40 mx-2 px-3 py-1.5 [contain-intrinsic-size:auto_48px] [content-visibility:auto]",
        position === "single" && "rounded-xl py-2",
        position === "start" && "rounded-t-xl pt-2",
        position === "middle" && "-mt-6",
        position === "end" && "-mt-6 rounded-b-xl pb-2",
      )}
    >
      {opensExchange && (
        <div
          data-slot="aui_spoken-exchange-header"
          className="text-muted-foreground mb-1.5 flex items-center gap-1.5 text-xs"
        >
          <Icon.Microphone className="size-3" />
          <span>Voice conversation</span>
        </div>
      )}
      <div
        data-slot="aui_spoken-message-content"
        className="text-foreground flex items-start gap-2 text-sm leading-relaxed"
      >
        <span className="text-muted-foreground mt-1 shrink-0" aria-hidden>
          {role === "user" ? (
            <Icon.Microphone className="size-3.5" />
          ) : (
            <Icon.Chat className="size-3.5" />
          )}
        </span>
        <span className="sr-only">
          {role === "user" ? "You said" : "Assistant said"}
        </span>
        <div className="min-w-0 flex-1 wrap-break-word">
          <MessagePrimitive.Parts components={{ Text: SpokenText }} />
          {isSpeaking && (
            <span
              data-slot="aui_spoken-message-indicator"
              role="status"
              className="text-muted-foreground ms-1 animate-pulse font-sans"
              aria-label="Assistant is speaking"
            >
              ●
            </span>
          )}
        </div>
        <SpokenActionBar />
      </div>
    </MessagePrimitive.Root>
  );
};

const SpokenActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="always"
      className="aui-spoken-action-bar text-muted-foreground flex shrink-0 gap-1"
    >
      <ActionBarPrimitive.Copy render={<TooltipIconButton tooltip="Copy" className="size-6" />}><AuiIf condition={(s) => s.message.isCopied}>
                      <Icon.Copied className="animate-in fade-in zoom-in-30 -spin-in-20 ease-lift duration-(--duration-lift)" />
                    </AuiIf><AuiIf condition={(s) => !s.message.isCopied}>
                      <Icon.Copy className="animate-in fade-in zoom-in-75" />
                    </AuiIf></ActionBarPrimitive.Copy>
    </ActionBarPrimitive.Root>
  );
};

const FOCUSABLE_SELECTOR =
  "a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex='-1']):not([disabled])";

const nextFocusable = (start: Element) => {
  for (
    let element = start.nextElementSibling;
    element;
    element = element.nextElementSibling
  ) {
    const target = element.matches(FOCUSABLE_SELECTOR)
      ? element
      : element.querySelector(FOCUSABLE_SELECTOR);
    if (target instanceof HTMLElement) return target;
  }
  return null;
};

const ThreadLoadEarlier: FC = () => {
  const visible = useAuiState(
    (s) => s.thread.hasEarlier || s.thread.isLoadingEarlier,
  );
  const loading = useAuiState((s) => s.thread.isLoadingEarlier);
  const slotRef = useRef<HTMLDivElement>(null);
  const focusedRef = useRef<Element | null>(null);

  // The last page removes the button; a keyboard user on it continues from the
  // next control in tab order rather than from the document body.
  useLayoutEffect(() => {
    const focused = focusedRef.current;
    const slot = slotRef.current;
    if (visible || !focused || focused.isConnected || !slot) return;
    focusedRef.current = null;
    const active = document.activeElement;
    if (active && active !== document.body) return;
    nextFocusable(slot)?.focus();
  }, [visible]);

  return (
    <div
      ref={slotRef}
      className="contents"
      onFocus={(event) => {
        focusedRef.current = event.target;
      }}
    >
      <span role="status" className="sr-only">
        {loading ? "Loading earlier messages" : ""}
      </span>
      {visible && (
        <ThreadPrimitive.LoadEarlier render={<Button variant="ghost" size="sm" data-slot="aui_thread-load-earlier" className="aui-thread-load-earlier text-muted-foreground mb-6 self-center rounded-full" />}><span
                            className={cn(loading && "shimmer motion-reduce:animate-none")}
                          >
                            {loading ? "Loading earlier messages" : "Load earlier messages"}
                          </span></ThreadPrimitive.LoadEarlier>
      )}
    </div>
  );
};

const ThreadScrollToBottom: FC = () => {
  return (
    <ThreadPrimitive.ScrollToBottom render={<TooltipIconButton tooltip="Scroll to bottom" variant="outline" className="aui-thread-scroll-to-bottom border-separator bg-raised absolute -top-12 z-10 size-9 self-center rounded-full p-2 shadow-composer disabled:invisible" />}><Icon.Next className="size-4 rotate-90" /></ThreadPrimitive.ScrollToBottom>
  );
};

/** A file the composer refuses never reaches its tray, so the refusal is said here. */
const AttachmentRefusals: FC = () => {
  useAuiEvent("composer.attachmentAddError", (event) => {
    toastManager.add({
      type: "error",
      title:
        event.reason === "not-accepted"
          ? "Theorem does not take this kind of file"
          : "That file could not be added",
      description:
        event.reason === "not-accepted" ? event.contentType : event.message,
    });
  });
  return <ToastProvider position="top-center" />;
};

const Composer: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  const aui = useAui();
  const shellRef = useRef<HTMLDivElement>(null);
  // Where the text was, for the new user message to fly up from. Recorded on
  // submit because the composer.send event arrives a microtask after the
  // message has already mounted.
  const recordLaunches = () => {
    const shell = shellRef.current;
    if (!shell || !aui.composer.getState().canSend) return;
    const input = shell.querySelector("textarea") ?? shell;
    recordLaunch(input.getBoundingClientRect());
    const footer = shell.closest(".aui-thread-viewport-footer");
    if (footer) recordLaunch(footer.getBoundingClientRect(), "composer-dock");
  };
  // The composer gives a small kick once the send goes through.
  useAuiEvent("composer.send", (event) => {
    if (event.messageId === undefined && shellRef.current) kick(shellRef.current);
  });

  return (
    <ComposerPrimitive.TriggerPopoverRoot>
    <ComposerPrimitive.Root
      onSubmit={recordLaunches}
      className="aui-composer-root relative flex w-full flex-col"
    >
      <ComposerToolTrigger />
      {/* The composer lifts off the sheet as the sheet lifts off the rail. */}
      <div aria-hidden="true" className="lift-glow [--glow-radius:var(--composer-radius)]" />
      <AttachmentRefusals />
      <ComposerPrimitive.AttachmentDropzone render={<div ref={shellRef} data-slot="aui_composer-shell" data-kit-perch="composer" className="border-separator focus-within:border-control data-[dragging=true]:border-focus surface-paper flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border p-(--composer-padding) transition-[border-color] duration-100 data-[dragging=true]:border-dashed data-[dragging=true]:bg-selected" />}><ComposerReferences /><ComposerAttachments /><ComposerPrimitive.Input
                      placeholder="Message Theorem, / for tools"
                      className="aui-composer-input caret-redwood placeholder:text-ink-faint max-h-72 min-h-14 w-full resize-none bg-transparent px-2 pt-1.5 pb-2 text-[1rem] leading-6 outline-none focus-visible:outline-none"
                      rows={1}
                      autoFocus={autoFocus}
                      enterKeyHint="send"
                      aria-label="Message input"
                      onFocus={() => attendKit(true)}
                      onBlur={() => attendKit(false)}
                    /><ComposerAction /></ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
    </ComposerPrimitive.TriggerPopoverRoot>
  );
};

const ComposerAction: FC = () => {
  const { disabled: sendDisabled } = useComposerSend();
  // The stop control only cancels the send while no run it could stop is going.
  const isSending = useAuiState(
    (s) =>
      s.composer.submission !== undefined &&
      !(s.thread.isRunning && s.thread.capabilities.cancel),
  );

  return (
    <div className="aui-composer-action-wrapper flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
      <div className="flex items-center gap-1.5">
        <ComposerAddAttachment />
        <ComposerWebToggle />
        <ComposerPlanToggle />
      </div>
      {/* Claims 8rem beside the attachment button, Web and Plan, so a long
          model name truncates first; the row wraps only when less than that is left. */}
      <div className="flex min-w-0 flex-[1_1_8rem] items-center justify-end gap-1.5">
        <ModelPicker />
        <EffortPicker />
        <StylePicker />
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate render={<TooltipIconButton tooltip="Voice input" delay={COMPOSER_TOOLTIP_DELAY} side="top" type="button" variant="ghost" size="icon" className="aui-composer-dictate text-ink-muted hover:text-ink size-9 rounded-lg" aria-label="Start voice input" />}><Icon.Microphone className="aui-composer-dictate-icon size-4" /></ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation render={<TooltipIconButton tooltip="Stop dictation" delay={COMPOSER_TOOLTIP_DELAY} side="top" type="button" variant="ghost" size="icon" className="aui-composer-stop-dictation text-error-ink size-9 rounded-lg" aria-label="Stop voice input" />}><Icon.Stop className="aui-composer-stop-dictation-icon size-4 animate-pulse" /></ComposerPrimitive.StopDictation>
          </AuiIf>
        </AuiIf>
        <AuiIf
          condition={(s) =>
            (!s.composer.canCancel ||
              (s.thread.voice !== undefined &&
                s.composer.submission === undefined)) &&
            !shouldShowComposerResume(s)
          }
        >
          <Magnet><TooltipIconButton tooltip="Send message" delay={COMPOSER_TOOLTIP_DELAY} side="top" type="submit" disabled={sendDisabled} variant="default" size="icon" className="aui-composer-send bg-redwood text-on-redwood hover:bg-redwood-hover active:bg-redwood-pressed size-9 rounded-lg disabled:opacity-40 p-2" aria-label="Send message"><Icon.Send className="aui-composer-send-icon size-5 animate-in fade-in zoom-in-50 slide-in-from-bottom-2" /></TooltipIconButton></Magnet>
        </AuiIf>
        <AuiIf condition={shouldShowComposerResume}>
          <Magnet><ComposerPrimitive.Resume render={<TooltipIconButton tooltip="Resume generating" delay={COMPOSER_TOOLTIP_DELAY} side="top" type="button" variant="default" size="icon" className="aui-composer-resume bg-redwood text-on-redwood hover:bg-redwood-hover active:bg-redwood-pressed size-9 rounded-lg disabled:opacity-40 p-2" aria-label="Resume generating" />}><Icon.Refresh className="aui-composer-resume-icon size-5 animate-in fade-in zoom-in-50 -spin-in-180 ease-lift duration-(--duration-lift)" /></ComposerPrimitive.Resume></Magnet>
        </AuiIf>
        <AuiIf
          condition={(s) =>
            s.composer.canCancel &&
            (s.thread.voice === undefined ||
              s.composer.submission !== undefined)
          }
        >
          <Magnet><ComposerPrimitive.Cancel render={<Button type="button" variant="default" size="icon" className="aui-composer-cancel bg-redwood text-on-redwood hover:bg-redwood-hover active:bg-redwood-pressed size-9 rounded-lg disabled:opacity-40" aria-label={isSending ? "Cancel sending" : "Stop generating"} />}><Icon.Stop className="aui-composer-cancel-icon size-5 animate-in fade-in zoom-in-30 spin-in-90" /></ComposerPrimitive.Cancel></Magnet>
        </AuiIf>
      </div>
    </div>
  );
};

const MessageError: FC = () => {
  const hasErrorPart = useAuiState((s) => {
    const status = s.message.status;
    const error = status?.type === "incomplete" ? status.error : undefined;
    return typeof error === "string" && hasTheoremError(s.message.content, error);
  });
  if (hasErrorPart) return null;
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root bg-error-container text-error-ink mt-2 rounded-lg px-4 py-3 text-sm">
        <ErrorPrimitive.Message className="aui-message-error-message break-words" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

/** An assistant message's parts as the thread shows them; a delegation panel shows a specialist's run with it. */
/** How long the person waited for this reply, for history that kept no part timing. */
const turnSeconds = (s: AssistantState) => {
  const { messages } = s.thread;
  const at = messages.findIndex((message) => message.id === s.message.id);
  const asked = messages.slice(0, Math.max(at, 0)).findLast(
    (message) => message.role === "user",
  );
  const replied = messages[at];
  if (!asked || !replied) return undefined;
  return Math.round(
    (replied.createdAt.getTime() - asked.createdAt.getTime()) / 1000,
  );
};

const spokenSeconds = (seconds: number) =>
  seconds < 60 ? `${seconds}s` : `${Math.floor(seconds / 60)}m ${seconds % 60}s`;

/**
 * The reasoning and tool calls behind a reply, one row until it is opened. It
 * stands open while the model works and folds once it is done, unless the
 * person has already chosen.
 */
const WorkGroup: FC<{ group: ThreadGroupPart; children: ReactNode }> = ({
  group,
  children,
}) => {
  const running = group.status.type === "running";
  const turn = useAuiState(turnSeconds);
  const [chosen, setChosen] = useState<boolean>();
  const seconds = reasoningDuration(group.timing) ?? turn;
  return (
    <Collapsible
      data-slot="aui_chain-of-thought"
      className="mb-3"
      open={chosen ?? running}
      onOpenChange={setChosen}
    >
      <CollapsibleTrigger className="group/work flex h-9 w-full items-center gap-2 rounded-lg border border-separator bg-raised/40 px-3 text-sm text-ink-muted outline-none transition-colors duration-(--duration-snap) ease-snap hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
        <ChevronRight
          aria-hidden
          className="size-3.5 transition-transform duration-(--duration-snap) ease-snap group-data-panel-open/work:rotate-90"
        />
        <span className={cn(running && "shimmer motion-reduce:animate-none")}>
          {running
            ? "Working"
            : seconds
              ? `Worked for ${spokenSeconds(seconds)}`
              : "Worked"}
        </span>
      </CollapsibleTrigger>
      <CollapsiblePanel>
        <div className="pt-2">{children}</div>
      </CollapsiblePanel>
    </Collapsible>
  );
};

export const AssistantMessageContent: FC = () => {
  const {
    ToolFallback: ToolFallbackComponent = TheoremToolCall,
    ToolGroup,
    ReasoningGroup,
    TaskGroup: TaskGroupComponent,
  } = useContext(ThreadComponentsContext);
  const groupBy = TaskGroupComponent ? taskAwareGroupBy : messageGroupBy;
  // Theorem: a tool group draws no row; its calls fold into the run summary.
  const parts = useAuiState((s) => s.message.parts);
  const toolUIs = useAuiState((s) => s.tools.toolUIs);
  const folded = useMemo(
    () =>
      ToolGroup
        ? []
        : parts.flatMap((part, index) =>
            groupBy(part, { toolUIs }).at(-1) === "group-tool" ? [index] : [],
          ),
    [ToolGroup, groupBy, parts, toolUIs],
  );

  return (
    <div
      data-slot="aui_assistant-message-content"
      className="text-foreground px-2 leading-6 wrap-break-word"
    >
      <RunSummary tools={folded} Tool={ToolFallbackComponent} />
      <MessagePrimitive.GroupedParts groupBy={groupBy}>
        {({ part, children }) => {
          switch (part.type) {
            case "group-chainOfThought":
              return <WorkGroup group={part}>{children}</WorkGroup>;
            case "group-task":
              return TaskGroupComponent ? (
                <TaskGroupComponent group={part} />
              ) : null;
            case "group-tool":
              return ToolGroup ? (
                <ToolGroup group={part}>{children}</ToolGroup>
              ) : null;
            case "group-reasoning": {
              if (ReasoningGroup) {
                return (
                  <ReasoningGroup group={part}>{children}</ReasoningGroup>
                );
              }
              const running = part.status.type === "running";
              return (
                <ReasoningRoot streaming={running}>
                  <ReasoningTrigger
                    active={running}
                    duration={reasoningDuration(part.timing)}
                  />
                  <ReasoningContent aria-busy={running}>
                    <ReasoningText>{children}</ReasoningText>
                  </ReasoningContent>
                </ReasoningRoot>
              );
            }
            case "text":
              return <MarkdownText />;
            case "reasoning":
              return <Reasoning {...part} />;
            case "tool-call":
              return part.toolUI ?? <ToolFallbackComponent {...part} />;
            case "data":
              return part.dataRendererUI;
            case "file":
              return (
                <div data-slot="aui_assistant-message-file" className="py-1">
                  <MessageFile {...part} />
                </div>
              );
            case "image":
              return (
                <div data-slot="aui_assistant-message-image" className="py-1">
                  <Image {...part} />
                </div>
              );
            case "indicator":
              return null;
            default:
              return null;
          }
        }}
      </MessagePrimitive.GroupedParts>
      <RunningIndicator />
      <MessageError />
    </div>
  );
};
/** A mark, then who spoke above what they said, as in docs/plans/evidence/refs/sidebar-compare@2026-11-05.webp. */
/** The agent speaks from the left of the column, under its mark and name. */
const MESSAGE_GRID = "grid grid-cols-[2rem_minmax(0,1fr)] gap-x-1 ps-2";
const MESSAGE_SPEAKER = "flex min-h-6 items-center gap-2 px-2 font-medium text-ink";

/** The attributes that make a message a surface Kit can stand on, named and labelled for the agent. */
function useKitSurface() {
  const id = useAuiState((s) => s.message.id);
  const label = useAuiState((s) =>
    messageLabel(
      s.message.role,
      s.message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(" "),
    ),
  );
  return { "data-kit-perch": messageSurface(id), "data-kit-label": label };
}

const AssistantMessage: FC = () => {
  const live = useArrivedLive();
  const surface = useKitSurface();
  // Theorem: a scene is wider than the row, and `content-visibility: auto`
  // paint-contains the row, which would clip it.
  const hasScene = useAuiState((s) =>
    s.message.content.some(
      (part) => part.type === "data" && part.name === SCENE_PART,
    ),
  );
  const ACTION_BAR_PT = "pt-1.5";
  // Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
  const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      {...surface}
      data-role="assistant"
      data-live={live || undefined}
      className={cn(
        MESSAGE_GRID,
        "data-live:animate-in data-live:fade-in data-live:slide-in-from-bottom-3 data-live:ease-settle data-live:duration-(--duration-settle) relative -mb-7.5 pb-7.5",
        !hasScene && "[contain-intrinsic-size:auto_200px] [content-visibility:auto]",
      )}
    >
      <span
        aria-hidden
        className="text-ink-muted flex size-8 items-center justify-center"
      >
        <ProjectGlyph className="size-5" />
      </span>
      <div className="min-w-0">
        <div className={cn(MESSAGE_SPEAKER, "mb-1.5")}>Theorem</div>
        <AssistantMessageContent />

        <div
          data-slot="aui_assistant-message-footer"
          className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
        >
          <BranchPicker />
          <AssistantActionBar />
        </div>
        <ResponseDetailsDialog />
      </div>
    </MessagePrimitive.Root>
  );
};

/** Opens a new thread with this conversation's history through this reply. */
const ForkFromMessage: FC = () => {
  const threadId = useAuiState((s) => s.threadListItem.remoteId);
  const messageId = useAuiState((s) => s.message.id);
  const runId = useAuiState((s) => s.message.metadata.custom.theoremRunId);
  const startThread = useStartThreadFrom();
  if (!threadId) return null;
  return (
    <ActionBarMorePrimitive.Item
      className="aui-action-bar-more-item hover:bg-hover focus:bg-hover flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none"
      disabled={startThread.isPending}
      onSelect={() =>
        startThread.mutate({
          kind: "forked",
          threadId,
          at: { messageId, runId: typeof runId === "string" ? runId : undefined },
        })
      }
    >
      <Icon.Fork className="size-4" />
      Fork into new thread
    </ActionBarMorePrimitive.Item>
  );
};
const AssistantActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className={cn(
        "aui-assistant-action-bar-root text-muted-foreground col-start-3 row-start-2 -ms-1 flex gap-1",
        // When a live reply finishes, its actions pop in one after another.
        "in-data-live:[&>*]:animate-in in-data-live:[&>*]:fade-in in-data-live:[&>*]:zoom-in-50 in-data-live:[&>*]:fill-mode-both in-data-live:[&>*]:ease-snap in-data-live:[&>*]:duration-(--duration-snap)",
        "in-data-live:[&>*:nth-child(2)]:[animation-delay:50ms] in-data-live:[&>*:nth-child(3)]:[animation-delay:100ms]",
      )}
    >
      <ActionBarPrimitive.Copy render={<TooltipIconButton tooltip="Copy" />}><AuiIf condition={(s) => s.message.isCopied}>
                      <Icon.Copied className="animate-in fade-in zoom-in-30 -spin-in-20 ease-lift duration-(--duration-lift)" />
                    </AuiIf><AuiIf condition={(s) => !s.message.isCopied}>
                      <Icon.Copy className="animate-in fade-in zoom-in-75" />
                    </AuiIf></ActionBarPrimitive.Copy>
      <ActionBarPrimitive.Reload render={<TooltipIconButton tooltip="Regenerate" />}><Icon.Reload /></ActionBarPrimitive.Reload>
      <ActionBarMorePrimitive.Root>
        <ActionBarMorePrimitive.Trigger render={<TooltipIconButton tooltip="More" className="data-[state=open]:bg-selected" />}><Icon.More /></ActionBarMorePrimitive.Trigger>
        <ActionBarMorePrimitive.Content
          side="bottom"
          align="start"
          sideOffset={6}
          className="aui-action-bar-more-content bg-popover text-popover-foreground shadow-popover data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-50 min-w-[8rem] overflow-hidden rounded-xl border p-1.5"
        >
          <ForkFromMessage />
          <ResponseDetailsItem />
          <ActionBarPrimitive.ExportMarkdown render={<ActionBarMorePrimitive.Item className="aui-action-bar-more-item hover:bg-hover focus:bg-hover flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none" />}><Icon.Share className="size-4" />Export as Markdown
                              </ActionBarPrimitive.ExportMarkdown>
        </ActionBarMorePrimitive.Content>
      </ActionBarMorePrimitive.Root>
    </ActionBarPrimitive.Root>
  );
};

const MessageFile: FileMessagePartComponent = (part) => {
  const image = part.mimeType.toLowerCase().startsWith("image/")
    ? getFileHref(part.data, part.mimeType, part.sourceType)
    : null;
  if (!image) return <File {...part} />;
  return (
    <Image
      type="image"
      image={image}
      status={part.status}
      {...(part.filename !== undefined && { filename: part.filename })}
    />
  );
};

const UserFilePart: FileMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-file" className="py-1">
    <MessageFile {...part} />
  </div>
);

const UserImagePart: ImageMessagePartComponent = (part) => (
  <div data-slot="aui_user-message-image" className="py-1">
    <Image {...part} />
  </div>
);

const UserMessage: FC = () => {
  const contentRef = useRef<HTMLDivElement>(null);
  const surface = useKitSurface();
  // A message just sent from the composer flies up from where it was typed.
  useLayoutEffect(() => {
    const origin = takeLaunch();
    const content = contentRef.current;
    if (!origin || !content) return;
    // The root's content-visibility would clip the flight to its own box.
    const root = content.closest<HTMLElement>(
      '[data-slot="aui_user-message-root"]',
    );
    root?.style.setProperty("content-visibility", "visible");
    // The message starts where the composer's text does, so it rises straight
    // up rather than swinging across.
    const { width } = content.getBoundingClientRect();
    const start = new DOMRect(origin.left, origin.top, width, origin.height);
    void flyFrom(content, start)?.then(() =>
      root?.style.removeProperty("content-visibility"),
    );
  }, []);

  return (
    // The person speaks from the right of the column, across from the agent,
    // on the composer's paper the message rose from.
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      {...surface}
      className="flex flex-col items-end gap-1 ps-[20%] pe-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
      data-role="user"
    >
      <UserMessageAttachments />
      <div className="aui-user-message-content-wrapper flex max-w-full min-w-0 items-start gap-1">
        <div className="aui-user-action-bar-wrapper pt-1">
          <UserActionBar />
        </div>
        <div
          ref={contentRef}
          className="aui-user-message-content surface-paper border-separator text-ink min-w-0 rounded-2xl border px-3.5 py-2 leading-6 whitespace-pre-wrap wrap-break-word empty:hidden"
        >
          <MessagePrimitive.Parts
            components={{
              File: UserFilePart,
              Image: UserImagePart,
              Text: UserTextPart,
            }}
          />
        </div>
      </div>
      <BranchPicker data-slot="aui_user-branch-picker" className="px-1" />
    </MessagePrimitive.Root>
  );
};

/**
 * A review's answer has a card naming the review, so the line telling the
 * agent which one stays out of view. A long paste folds after its opening,
 * so the replies around it stay in reach.
 */
const UserTextPart: TextMessagePartComponent = (part) => {
  const answered = useAuiState((s) =>
    s.message.parts.some(
      (part) => part.type === "data" && part.name === "theorem-review_answer",
    ),
  );
  const text = answered ? answerBody(part.text) : part.text;
  if (!text) return null;
  return (
    <ChatCollapsibleMessage
      text={text}
      side="outgoing"
      showMoreLabel="Show more"
      showLessLabel="Show less"
      renderText={(shown) => <DirectiveText {...part} text={shown} />}
    />
  );
};

const UserActionBar: FC = () => {
  return (
    <ActionBarPrimitive.Root
      hideWhenRunning
      autohide="not-last"
      className="aui-user-action-bar-root flex flex-col items-end"
    >
      <ActionBarPrimitive.Edit render={<TooltipIconButton tooltip="Edit" className="aui-user-action-edit" />}><Icon.Edit /></ActionBarPrimitive.Edit>
    </ActionBarPrimitive.Root>
  );
};

const EditComposer: FC = () => {
  return (
    // No content-visibility here, unlike the message rows: its paint
    // containment would clip the composer's shadow and glow, and only the
    // message being edited renders this.
    <MessagePrimitive.Root
      data-slot="aui_edit-composer-wrapper"
      className="flex flex-col px-2"
    >
      <div className="relative ms-auto w-full max-w-[70%]">
        <div aria-hidden="true" className="lift-glow [--glow-radius:var(--composer-radius)]" />
        <ComposerPrimitive.TriggerPopoverRoot>
        <ComposerPrimitive.Root className="aui-edit-composer-root border-separator focus-within:border-control surface-paper flex w-full cursor-text flex-col rounded-(--composer-radius) border transition-[border-color] duration-100">
          <ComposerToolTrigger />
          <ComposerPrimitive.Input
            className="aui-edit-composer-input text-foreground min-h-14 w-full resize-none bg-transparent px-4 pt-3 pb-1 text-base outline-none"
            autoFocus
          />
          <div className="aui-edit-composer-footer mx-2.5 mb-2.5 flex items-center gap-1.5 self-end">
            <ComposerPrimitive.Cancel render={<Button variant="ghost" size="sm" className="h-8 px-3" />}>Cancel
                                </ComposerPrimitive.Cancel>
            <ComposerPrimitive.Send render={<Button size="sm" className="bg-redwood text-on-redwood hover:bg-redwood-hover h-8 px-3" />}>Send
                                </ComposerPrimitive.Send>
          </div>
        </ComposerPrimitive.Root>
        </ComposerPrimitive.TriggerPopoverRoot>
      </div>
    </MessagePrimitive.Root>
  );
};

const BranchPicker: FC<BranchPickerPrimitive.Root.Props> = ({
  className,
  ...rest
}) => {
  return (
    <BranchPickerPrimitive.Root
      hideWhenSingleBranch
      className={cn(
        "aui-branch-picker-root text-muted-foreground -ms-2 me-2 inline-flex items-center text-xs",
        className,
      )}
      {...rest}
    >
      <BranchPickerPrimitive.Previous render={<TooltipIconButton tooltip="Previous" />}><Icon.Previous /></BranchPickerPrimitive.Previous>
      <span className="aui-branch-picker-state font-medium">
        <BranchPickerPrimitive.Number /> / <BranchPickerPrimitive.Count />
      </span>
      <BranchPickerPrimitive.Next render={<TooltipIconButton tooltip="Next" />}><Icon.Next /></BranchPickerPrimitive.Next>
    </BranchPickerPrimitive.Root>
  );
};
