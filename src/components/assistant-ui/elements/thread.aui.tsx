"use client";
// SOURCING: @assistant-ui/react (the registry's thread, adopted and restyled: ThreadPrimitive, ComposerPrimitive, MessagePrimitive, ThreadPrimitive.Suggestion for the welcome suggestions)

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
import {
  ToolGroupContent,
  ToolGroupRoot,
  ToolGroupTrigger,
} from "@/components/assistant-ui/elements/tool-group.aui";
import { TooltipIconButton } from "@/components/assistant-ui/elements/tooltip-icon-button";
import {
  isStandaloneToolCall,
  RunningIndicator,
  TheoremToolCall,
} from "@/components/chat/theorem-parts";
import { COMPOSER_TOOLTIP_DELAY, ComposerTools, useComposerRequests } from "@/components/chat/composer-tools";
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
  useRef,
} from "react";
import type { ComponentType, FC, PropsWithChildren } from "react";

import { useWelcome } from "@/components/chat/welcome";
import { Magnet, useArrivedLive, useWordsIn } from "@/components/motion";
import { flyFrom, kick, recordLaunch, takeLaunch } from "@/lib/motion";

export type ThreadGroupPart = MessagePrimitive.GroupedParts.GroupPart;

const shouldShowComposerResume = (s: AssistantState) =>
  !!s.thread.canResume && s.composer.type === "thread" && s.composer.isEmpty;

const reasoningDuration = (timing: ThreadGroupPart["timing"]) =>
  timing?.completedAt === undefined
    ? undefined
    : Math.round((timing.completedAt - timing.startedAt) / 1000);

/**
 * Optional component overrides for the thread. `AssistantMessage` and
 * `Welcome` replace whole sections; the remaining slots override how the
 * assistant message renders tool calls and part groups. Tool UIs registered
 * by name (toolkit `render`, `useAssistantDataUI`) take precedence over
 * `ToolFallback`. When `TaskGroup` is set, tool calls that carry a nested
 * conversation and have no registered UI render through it instead of the
 * tool group; without it they render like any other tool call.
 */
export type ThreadComponents = {
  AssistantMessage?: ComponentType | undefined;
  Welcome?: ComponentType | undefined;
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
};

const EMPTY_COMPONENTS: ThreadComponents = {};

const ThreadComponentsContext =
  createContext<ThreadComponents>(EMPTY_COMPONENTS);

// Startup exposes a loading placeholder thread; treat it as a new chat so
// the composer mounts centered. Loads after startup keep the docked layout.
const isNewChatView = (s: AssistantState) =>
  s.thread.messages.length === 0 &&
  (!s.thread.isLoading || s.threads.isLoading);

// A switched thread that is still fetching its history: skeleton, not the empty view.
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
    <Skeleton className="ml-auto h-9 w-2/5 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-11/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-4/5 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-3/5 motion-reduce:animate-none" />
    </div>
    <Skeleton className="ml-auto h-9 w-1/3 rounded-xl motion-reduce:animate-none" />
    <div className="flex flex-col gap-y-2">
      <Skeleton className="h-4 w-10/12 motion-reduce:animate-none" />
      <Skeleton className="h-4 w-2/3 motion-reduce:animate-none" />
    </div>
  </div>
);

export const Thread: FC<ThreadProps> = ({
  components = EMPTY_COMPONENTS,
  autoFocus = true,
}) => {
  const isEmpty = useAuiState(isNewChatView);

  return (
    <ThreadComponentsContext.Provider value={components}>
      <ThreadRoot isEmpty={isEmpty} autoFocus={autoFocus} />
    </ThreadComponentsContext.Provider>
  );
};

const ThreadRoot: FC<{ isEmpty: boolean; autoFocus: boolean }> = ({
  isEmpty,
  autoFocus,
}) => {
  const { Welcome = ThreadWelcome } = useContext(ThreadComponentsContext);
  const footerRef = useRef<HTMLDivElement>(null);
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
        ["--thread-max-width" as string]: "var(--spacing-reading)",
        ["--composer-bg" as string]: "var(--surface-composer)",
        ["--composer-radius" as string]: "var(--radius-2xl)",
        ["--composer-padding" as string]: "10px",
      }}
    >
      <ThreadPrimitive.Viewport
        turnAnchor="top"
        data-slot="aui_thread-viewport"
        className="relative flex flex-1 flex-col overflow-x-auto overflow-y-scroll scroll-smooth"
      >
        <div
          className={cn(
            "mx-auto flex w-full max-w-(--thread-max-width) flex-1 flex-col px-4 pt-4",
            isEmpty && "justify-center",
          )}
        >
          <AuiIf condition={isNewChatView}>
            <Welcome />
          </AuiIf>
          <AuiIf condition={isHistoryLoadingView}>
            <ThreadHistorySkeleton />
          </AuiIf>

          <ThreadLoadEarlier />

          <div
            data-slot="aui_message-group"
            className="mb-14 flex flex-col gap-y-6 empty:hidden"
          >
            <ThreadPrimitive.Messages>
              {() => <ThreadMessage />}
            </ThreadPrimitive.Messages>
          </div>

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
            <AuiIf condition={(s) => isNewChatView(s) && s.composer.isEmpty}>
              <ThreadSuggestions />
            </AuiIf>
          </ThreadPrimitive.ViewportFooter>
        </div>
      </ThreadPrimitive.Viewport>
    </ThreadPrimitive.Root>
  );
};

// The headline and suggestions are written for this person by the welcome
// route. While it answers they hold their space, so the composer does not
// jump; if it cannot answer, the composer stands alone.
const ThreadWelcome: FC = () => {
  const welcome = useWelcome();
  if (welcome.isError) return null;
  return (
    <div className="aui-thread-welcome-root mb-8 px-2">
      {welcome.data ? (
        <ThreadHeadline key={welcome.data.headline} text={welcome.data.headline} />
      ) : (
        <Skeleton className="h-[35px] w-3/5 motion-reduce:animate-none" />
      )}
    </div>
  );
};

const ThreadHeadline: FC<{ text: string }> = ({ text }) => {
  const ref = useRef<HTMLHeadingElement>(null);
  useWordsIn(ref, { gap: 55, y: 14, ease: "lift" });
  return (
    <h1
      ref={ref}
      className="aui-thread-welcome-message-inner font-heading text-[28px] font-normal tracking-tight leading-tight"
    >
      {text}
    </h1>
  );
};

const ThreadSuggestions: FC = () => {
  const welcome = useWelcome();
  if (welcome.isError) return null;
  if (!welcome.data) {
    return (
      <div className="flex flex-col gap-1 px-2 py-2">
        <Skeleton className="h-5 w-1/2 motion-reduce:animate-none" />
        <Skeleton className="mt-2 h-5 w-2/5 motion-reduce:animate-none" />
      </div>
    );
  }
  return (
    <div
      className={cn(
        "aui-thread-welcome-suggestions flex w-full flex-col",
        "[&>*]:animate-in [&>*]:fade-in [&>*]:slide-in-from-bottom-2 [&>*]:fill-mode-both [&>*]:ease-settle [&>*]:duration-(--duration-settle) motion-reduce:[&>*]:animate-none",
        "[&>*:nth-child(1)]:[animation-delay:380ms] [&>*:nth-child(2)]:[animation-delay:440ms]",
      )}
    >
      {welcome.data.suggestions.map((suggestion) => (
        <ThreadPrimitive.Suggestion
          key={suggestion.prompt}
          prompt={suggestion.prompt}
          send
          className="aui-thread-welcome-suggestion group hover:bg-hover flex w-full items-baseline gap-2.5 rounded-md px-2 py-2 text-start text-sm transition-colors duration-100 motion-reduce:transition-none"
        >
          <span
            aria-hidden
            className="text-muted-foreground/60 group-hover:text-foreground font-mono text-xs transition-colors motion-reduce:transition-none"
          >
            {">"}
          </span>
          <span className="min-w-0 flex-1 truncate">
            <span className="text-foreground">{suggestion.title}</span>{" "}
            <span className="text-muted-foreground">{suggestion.label}</span>
          </span>
        </ThreadPrimitive.Suggestion>
      ))}
    </div>
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
  return <AssistantMessageComponent />;
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

const Composer: FC<{ autoFocus: boolean }> = ({ autoFocus }) => {
  const aui = useAui();
  const applyRequests = useComposerRequests();
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
    <ComposerPrimitive.Root
      onSubmit={() => {
        recordLaunches();
        applyRequests();
      }}
      className="aui-composer-root relative flex w-full flex-col"
    >
      {/* The composer lifts off the sheet as the sheet lifts off the rail. */}
      <div aria-hidden="true" className="lift-glow [--glow-radius:var(--composer-radius)]" />
      <ComposerPrimitive.AttachmentDropzone render={<div ref={shellRef} data-slot="aui_composer-shell" className="border-separator focus-within:border-control data-[dragging=true]:border-focus shadow-sheet relative flex w-full cursor-text flex-col gap-2 rounded-(--composer-radius) border bg-(--composer-bg) p-(--composer-padding) transition-[border-color] duration-100 data-[dragging=true]:border-dashed data-[dragging=true]:bg-selected" />}><ComposerAttachments /><ComposerPrimitive.Input
                      placeholder="Message Theorem"
                      className="aui-composer-input caret-redwood placeholder:text-ink-faint max-h-60 min-h-10 w-full resize-none bg-transparent py-2 ps-2.5 pe-14 text-base leading-6 outline-none focus-visible:outline-none"
                      rows={1}
                      autoFocus={autoFocus}
                      enterKeyHint="send"
                      aria-label="Message input"
                    /><ComposerAction /></ComposerPrimitive.AttachmentDropzone>
    </ComposerPrimitive.Root>
  );
};

const ComposerAction: FC = () => {
  // The stop control only cancels the send while no run it could stop is going.
  const isSending = useAuiState(
    (s) =>
      s.composer.submission !== undefined &&
      !(s.thread.isRunning && s.thread.capabilities.cancel),
  );

  return (
    <div className="aui-composer-action-wrapper flex items-center justify-between">
      <div className="flex items-center gap-1">
        <ComposerAddAttachment />
        <ComposerTools />
      </div>
      <div className="absolute end-(--composer-padding) top-(--composer-padding) flex items-center gap-1.5">
        <AuiIf condition={(s) => s.thread.capabilities.dictation}>
          <AuiIf condition={(s) => s.composer.dictation == null}>
            <ComposerPrimitive.Dictate render={<TooltipIconButton tooltip="Voice input" delay={COMPOSER_TOOLTIP_DELAY} side="bottom" type="button" variant="ghost" size="icon" className="aui-composer-dictate text-ink-muted hover:text-ink size-10 rounded-lg" aria-label="Start voice input" />}><Icon.Microphone className="aui-composer-dictate-icon size-4" /></ComposerPrimitive.Dictate>
          </AuiIf>
          <AuiIf condition={(s) => s.composer.dictation != null}>
            <ComposerPrimitive.StopDictation render={<TooltipIconButton tooltip="Stop dictation" delay={COMPOSER_TOOLTIP_DELAY} side="bottom" type="button" variant="ghost" size="icon" className="aui-composer-stop-dictation text-error-ink size-10 rounded-lg" aria-label="Stop voice input" />}><Icon.Stop className="aui-composer-stop-dictation-icon size-4 animate-pulse" /></ComposerPrimitive.StopDictation>
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
          <Magnet><ComposerPrimitive.Send render={<TooltipIconButton tooltip="Send message" delay={COMPOSER_TOOLTIP_DELAY} side="bottom" type="submit" variant="default" size="icon" className="aui-composer-send bg-redwood text-on-redwood hover:bg-redwood-hover active:bg-redwood-pressed size-10 rounded-lg disabled:opacity-40 p-2.5" aria-label="Send message" />}><Icon.Send className="aui-composer-send-icon size-5 animate-in fade-in zoom-in-50 slide-in-from-bottom-2" /></ComposerPrimitive.Send></Magnet>
        </AuiIf>
        <AuiIf condition={shouldShowComposerResume}>
          <Magnet><ComposerPrimitive.Resume render={<TooltipIconButton tooltip="Resume generating" delay={COMPOSER_TOOLTIP_DELAY} side="bottom" type="button" variant="default" size="icon" className="aui-composer-resume bg-redwood text-on-redwood hover:bg-redwood-hover active:bg-redwood-pressed size-10 rounded-lg disabled:opacity-40 p-2.5" aria-label="Resume generating" />}><Icon.Refresh className="aui-composer-resume-icon size-5 animate-in fade-in zoom-in-50 -spin-in-180 ease-lift duration-(--duration-lift)" /></ComposerPrimitive.Resume></Magnet>
        </AuiIf>
        <AuiIf
          condition={(s) =>
            s.composer.canCancel &&
            (s.thread.voice === undefined ||
              s.composer.submission !== undefined)
          }
        >
          <Magnet><ComposerPrimitive.Cancel render={<Button type="button" variant="default" size="icon" className="aui-composer-cancel bg-redwood text-on-redwood hover:bg-redwood-hover active:bg-redwood-pressed size-10 rounded-lg disabled:opacity-40" aria-label={isSending ? "Cancel sending" : "Stop generating"} />}><Icon.Stop className="aui-composer-cancel-icon size-5 animate-in fade-in zoom-in-30 spin-in-90" /></ComposerPrimitive.Cancel></Magnet>
        </AuiIf>
      </div>
    </div>
  );
};

const MessageError: FC = () => {
  return (
    <MessagePrimitive.Error>
      <ErrorPrimitive.Root className="aui-message-error-root bg-error-container text-error-ink mt-2 rounded-lg px-4 py-3 text-sm">
        <ErrorPrimitive.Message className="aui-message-error-message line-clamp-2" />
      </ErrorPrimitive.Root>
    </MessagePrimitive.Error>
  );
};

const AssistantMessage: FC = () => {
  const {
    ToolFallback: ToolFallbackComponent = TheoremToolCall,
    ToolGroup,
    ReasoningGroup,
    TaskGroup: TaskGroupComponent,
  } = useContext(ThreadComponentsContext);
  const groupBy = TaskGroupComponent ? taskAwareGroupBy : messageGroupBy;

  const live = useArrivedLive();
  const ACTION_BAR_PT = "pt-1.5";
  // Keep the action bar inside the contained root's paint box, then cancel its reserved space in flow.
  const ACTION_BAR_HEIGHT = `min-h-7.5 ${ACTION_BAR_PT}`;

  return (
    <MessagePrimitive.Root
      data-slot="aui_assistant-message-root"
      data-role="assistant"
      data-live={live || undefined}
      className="data-live:animate-in data-live:fade-in data-live:slide-in-from-bottom-3 data-live:ease-settle data-live:duration-(--duration-settle) relative -mb-7.5 pb-7.5 [contain-intrinsic-size:auto_200px] [content-visibility:auto]"
    >
      <div
        data-slot="aui_assistant-message-content"
        className="text-foreground px-2 leading-6 wrap-break-word"
      >
        <MessagePrimitive.GroupedParts groupBy={groupBy}>
          {({ part, children }) => {
            switch (part.type) {
              case "group-chainOfThought":
                return <div data-slot="aui_chain-of-thought">{children}</div>;
              case "group-task":
                return TaskGroupComponent ? (
                  <TaskGroupComponent group={part} />
                ) : null;
              case "group-tool":
                if (ToolGroup) {
                  return <ToolGroup group={part}>{children}</ToolGroup>;
                }
                return (
                  <ToolGroupRoot variant="ghost">
                    <ToolGroupTrigger
                      count={part.indices.length}
                      active={part.status.type === "running"}
                    />
                    <ToolGroupContent>{children}</ToolGroupContent>
                  </ToolGroupRoot>
                );
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

      <div
        data-slot="aui_assistant-message-footer"
        className={cn("ms-2 flex items-center", ACTION_BAR_HEIGHT)}
      >
        <BranchPicker />
        <AssistantActionBar />
      </div>
    </MessagePrimitive.Root>
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
    // The bubble sits at the end of the line, so it rises from the composer's
    // end edge rather than swinging across from where the text started.
    const { width } = content.getBoundingClientRect();
    const start = new DOMRect(origin.right - width, origin.top, width, origin.height);
    void flyFrom(content, start)?.then(() =>
      root?.style.removeProperty("content-visibility"),
    );
  }, []);

  return (
    <MessagePrimitive.Root
      data-slot="aui_user-message-root"
      className="grid auto-rows-auto grid-cols-[minmax(0,30%)_minmax(0,70%)] content-start gap-y-2 px-2 [contain-intrinsic-size:auto_200px] [content-visibility:auto] [&:where(>*)]:col-start-2"
      data-role="user"
    >
      <UserMessageAttachments />

      <div className="aui-user-message-content-wrapper relative col-start-2 flex min-w-0 justify-end">
        <div
          ref={contentRef}
          className="aui-user-message-content peer text-ink py-1 leading-6 whitespace-pre-wrap wrap-break-word empty:hidden"
        >
          <MessagePrimitive.Parts
            components={{ File: UserFilePart, Image: UserImagePart }}
          />
        </div>
        <div className="aui-user-action-bar-wrapper absolute start-0 top-1/2 -translate-x-full -translate-y-1/2 pe-2 peer-empty:hidden rtl:translate-x-full">
          <UserActionBar />
        </div>
      </div>

      <BranchPicker
        data-slot="aui_user-branch-picker"
        className="col-span-full col-start-1 -me-1 justify-end"
      />
    </MessagePrimitive.Root>
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
        <ComposerPrimitive.Root className="aui-edit-composer-root border-separator focus-within:border-control shadow-sheet relative flex w-full cursor-text flex-col rounded-(--composer-radius) border bg-(--composer-bg) transition-[border-color] duration-100">
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
