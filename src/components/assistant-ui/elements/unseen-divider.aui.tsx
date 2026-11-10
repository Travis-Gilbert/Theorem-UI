// SOURCING: coss ui chat-unread-divider (vendored in components/coss/chat), assistant-ui state (the open thread and its messages), lib/theorem/seen-threads (zustand persist); a thread is on screen while the document is visible and its viewport is laid out, read through ResizeObserver and visibilitychange
import { useAuiState } from "@assistant-ui/react";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { ChatUnreadDivider } from "@/components/coss/chat/chat-unread-divider";
import { firstUnseen, useSeenThreads } from "@/lib/theorem/seen-threads";
import type { Visit } from "@/lib/theorem/seen-threads";

const UnseenFrom = createContext<string | undefined>(undefined);
export const UnseenFromProvider = UnseenFrom.Provider;

/**
 * Remembers when the open thread was last on screen here, and finds the first
 * reply that landed since. Hand `ref` to the thread's viewport: the
 * conversation stays mounted behind other modes, so a hidden viewport means
 * the person is away as surely as a hidden tab does. (The message list itself
 * would not do: it collapses while history loads, which reads as leaving.)
 * `covered` says another view lies over the thread while it stays laid out,
 * as Theia and the Vault do on the desktop.
 */
export function useUnseenFrom(covered: boolean) {
  const threadId = useAuiState((s) => s.threadListItem.remoteId);
  const [list, setList] = useState<HTMLElement | null>(null);
  const [visit, setVisit] = useState<Visit & { threadId: string }>();
  const watching = useRef<{ threadId: string; shown: boolean }>(undefined);

  useEffect(() => {
    if (!threadId || !list) {
      // A new chat, or nothing laid out: coming back is a fresh look.
      watching.current = undefined;
      return;
    }
    const { mark } = useSeenThreads.getState();
    // Running again on the thread it was showing (a new element, a cover
    // coming down, StrictMode) is not a fresh look: the visit carries on.
    const previous = watching.current;
    const state = {
      threadId,
      shown: previous?.threadId === threadId && previous.shown,
    };
    watching.current = state;

    const sync = () => {
      const shown =
        !covered &&
        document.visibilityState === "visible" &&
        list.getClientRects().length > 0;
      if (shown === state.shown) return;
      state.shown = shown;
      if (shown)
        setVisit({
          threadId,
          since: useSeenThreads.getState().at[threadId],
          openedAt: Date.now(),
        });
      else mark(threadId, Date.now());
    };
    sync();
    const resize = new ResizeObserver(sync);
    resize.observe(list);
    document.addEventListener("visibilitychange", sync);
    return () => {
      resize.disconnect();
      document.removeEventListener("visibilitychange", sync);
      // Leaving for another thread, a new chat or another page is the last
      // time this one was seen.
      if (state.shown) mark(threadId, Date.now());
    };
  }, [threadId, list, covered]);

  const anchor = useAuiState((s) =>
    visit && visit.threadId === threadId
      ? firstUnseen(s.thread.messages, visit)
      : undefined,
  );
  return { ref: setList, anchor };
}

/** The line above the first reply that arrived while the person was away. */
export function UnseenDivider() {
  const id = useAuiState((s) => s.message.id);
  const anchor = useContext(UnseenFrom);
  if (anchor !== id) return null;
  return (
    <ChatUnreadDivider className="text-ink-muted my-0 font-normal">
      New since you were here
    </ChatUnreadDivider>
  );
}
