"use client";

import { useGlideHighlight, useLayoutSprings } from "@/components/motion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { useSeen } from "@/hooks/use-seen";
import {
  threadTreeKey,
  useBranchLabel,
  useSelectBranch,
  useThreadTree,
} from "@/lib/theorem/thread-tree";
import type { Theorem } from "@/lib/theorem/client";
import { cn } from "@/lib/utils";
import {
  ThreadListItemMorePrimitive,
  ThreadListItemPrimitive,
  ThreadListPrimitive,
  useAui,
  useAuiState,
} from "@assistant-ui/react";
import { Collapsible } from "@base-ui/react/collapsible";
import { ContextMenu } from "@base-ui/react/context-menu";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/icons";
import {
  forwardRef,
  Fragment,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import type { ComponentPropsWithoutRef, FC } from "react";

export const ThreadList: FC = () => {
  const [search, setSearch] = useState("");
  const hasThreads = useAuiState((s) => s.threads.threadIds.length > 0);

  return (
    <ThreadListRoot>
      <ThreadListNew />
      {hasThreads && (
        <ThreadListSearch value={search} onValueChange={setSearch} />
      )}
      <ThreadListItems searchQuery={hasThreads ? search : ""} />
    </ThreadListRoot>
  );
};

export const ThreadListSearch = forwardRef<
  HTMLInputElement,
  Omit<ComponentPropsWithoutRef<typeof Input>, "value" | "onChange"> & {
    value: string;
    onValueChange: (value: string) => void;
  }
>(({ className, value, onValueChange, ...props }, ref) => {
  return (
    <div data-slot="aui_thread-list-search" className="relative">
      <Icon.Search
        data-slot="aui_thread-list-search-icon"
        className="text-ink-faint pointer-events-none absolute start-2.5 top-1/2 size-3.5 -translate-y-1/2"
      />
      <Input
        ref={ref}
        type="search"
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        aria-label="Search threads"
        placeholder="Search"
        className={cn("bg-ink/6 h-7 rounded-md border-transparent ps-8 text-sm shadow-none dark:bg-ink/6", className)}
        {...props}
      />
    </div>
  );
});

ThreadListSearch.displayName = "ThreadListSearch";

export const ThreadListRoot: FC<
  ComponentPropsWithoutRef<typeof ThreadListPrimitive.Root>
> = ({ className, ...props }) => {
  return (
    <ThreadListPrimitive.Root
      data-slot="aui_thread-list-root"
      className={cn("flex flex-col", className)}
      {...props}
    />
  );
};

// Each thread moves with its branches, so the tree is the row that springs.
const LIST_ROWS =
  '[data-slot="aui_thread-list-item-tree"], [data-slot="aui_thread-list-group-label"]';
const ACTIVE_ROW =
  '[data-slot="aui_thread-list-item"][data-active], [data-slot="aui_thread-list-branch"] > [data-active]';

export const ThreadListItems: FC<
  ComponentPropsWithoutRef<"div"> & { searchQuery?: string }
> = ({ className, searchQuery = "", ...props }) => {
  const listing = useThreadListGroups(searchQuery);
  const isLoading = useAuiState((s) => s.threads.isLoading);
  const activeId = useAuiState((s) => s.threads.mainThreadId);
  const listRef = useRef<HTMLDivElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // Rows spring to their new places when the list reorders, and one pill
  // glides to the open thread or branch.
  const order = useMemo(() => {
    const { threadIds, filteredIndices, groups } = listing;
    if (isLoading) return "loading";
    if (!groups) return filteredIndices.map((i) => threadIds[i]).join(",");
    return groups
      .map((g) => `${g.label}:${g.indices.map((i) => threadIds[i]).join(",")}`)
      .join("|");
  }, [listing, isLoading]);
  useLayoutSprings(listRef, order, LIST_ROWS);
  useGlideHighlight(listRef, highlightRef, ACTIVE_ROW, `${activeId}|${order}`);

  // The pill sits outside the layout root: the layout restores the inline
  // styles of everything under its root, which would undo the glide.
  return (
    <div
      data-slot="aui_thread-list-items"
      className={cn("relative", className)}
      {...props}
    >
      <div
        ref={highlightRef}
        aria-hidden
        data-slot="aui_thread-list-highlight"
        // Inline so the glide owns visibility: an entrance clears its inline
        // opacity on landing, which a class would then hide again.
        style={{ opacity: 0 }}
        className="bg-pill shadow-pill pointer-events-none absolute rounded-md"
      />
      <div ref={listRef} className="flex flex-col">
        {isLoading ? (
          <ThreadListSkeleton />
        ) : (
          <ThreadListItemGroups listing={listing} searchQuery={searchQuery} />
        )}
      </div>
    </div>
  );
};

const dayLabel = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

/** Today, Yesterday, a date for each day of the past week, then Older. */
const dateGroupLabel = (
  date: Date | undefined,
  startOfToday: number,
  startOfYesterday: number,
  startOfWeek: number,
): string => {
  if (!date || date.getTime() >= startOfToday) return "Today";
  if (date.getTime() >= startOfYesterday) return "Yesterday";
  if (date.getTime() >= startOfWeek) return dayLabel.format(date);
  return "Older";
};

const startOfLocalDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();

const daysBefore = (startOfDay: number, days: number) => {
  const date = new Date(startOfDay);
  date.setDate(date.getDate() - days);
  return date.getTime();
};

const subscribeToNextDay = (onDayChange: () => void) => {
  let timeout: number;
  const scheduleNextDay = () => {
    const now = new Date();
    const startOfTomorrow = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    ).getTime();
    timeout = window.setTimeout(() => {
      onDayChange();
      scheduleNextDay();
    }, startOfTomorrow - now.getTime());
  };
  scheduleNextDay();
  return () => window.clearTimeout(timeout);
};

const getStartOfToday = () => startOfLocalDay(new Date());

// A server render and hydration see no day start, so a prerender never reads
// the clock; a client-only mount groups on its first render.
const getServerStartOfToday = () => undefined;

const useStartOfToday = () =>
  useSyncExternalStore<number | undefined>(
    subscribeToNextDay,
    getStartOfToday,
    getServerStartOfToday,
  );

export type ThreadListGroup = { label: string; indices: number[] };

/**
 * Filters the thread list by title and buckets the matches by last activity
 * (Today, Yesterday, each day of the past week, Older). `groups` is null when
 * no thread carries a date or while the local day start is unknown during
 * server render and hydration, in which case `filteredIndices` keeps the
 * runtime order.
 */
export const useThreadListGroups = (searchQuery = "") => {
  const threadIds = useAuiState((s) => s.threads.threadIds);
  const threadItems = useAuiState((s) => s.threads.threadItems);

  const query = searchQuery.trim().toLowerCase();
  const startOfToday = useStartOfToday();

  return useMemo(() => {
    const itemsById = new Map(threadItems.map((item) => [item.id, item]));
    const dates = threadIds.map((id) => itemsById.get(id)?.lastMessageAt);
    const filteredIndices = threadIds
      .map((id, index) => ({ id, index }))
      .filter(
        ({ id }) =>
          !query ||
          (itemsById.get(id)?.title || "New Chat")
            .toLowerCase()
            .includes(query),
      )
      .map(({ index }) => index);
    if (
      startOfToday === undefined ||
      !filteredIndices.some((index) => dates[index])
    ) {
      return { threadIds, filteredIndices, groups: null };
    }

    const startOfYesterday = daysBefore(startOfToday, 1);
    const startOfWeek = daysBefore(startOfToday, 6);
    const time = (index: number) =>
      dates[index]?.getTime() ?? Number.MAX_SAFE_INTEGER;
    const sorted = [...filteredIndices].sort((a, b) => time(b) - time(a));

    const result: ThreadListGroup[] = [];
    for (const index of sorted) {
      const label = dateGroupLabel(
        dates[index],
        startOfToday,
        startOfYesterday,
        startOfWeek,
      );
      const lastGroup = result[result.length - 1];
      if (lastGroup?.label === label) {
        lastGroup.indices.push(index);
      } else {
        result.push({ label, indices: [index] });
      }
    }
    return { threadIds, filteredIndices, groups: result };
  }, [threadIds, threadItems, query, startOfToday]);
};

const ThreadListItemGroups: FC<{
  listing: ReturnType<typeof useThreadListGroups>;
  searchQuery?: string;
}> = ({ listing, searchQuery = "" }) => {
  const { threadIds, filteredIndices, groups } = listing;
  const query = searchQuery.trim();

  if (query && filteredIndices.length === 0) {
    return (
      <>
        <div
          data-slot="aui_thread-list-empty"
          className="text-ink-faint-sheet px-2 py-4 text-sm"
        >
          No threads found
        </div>
        <ThreadListShowMore />
      </>
    );
  }

  if (!groups) {
    return (
      <>
        {filteredIndices.map((index) => (
          <ThreadListPrimitive.ItemByIndex
            key={threadIds[index]}
            index={index}
            components={{ ThreadListItem }}
          />
        ))}
        <ThreadListShowMore />
      </>
    );
  }

  return (
    <>
      {groups.map((group) => (
        <Fragment key={group.label}>
          <div
            data-slot="aui_thread-list-group-label"
            className="text-ink-faint-sheet px-2 pt-4 pb-1 text-xs"
          >
            {group.label}
          </div>
          {group.indices.map((index) => (
            <ThreadListPrimitive.ItemByIndex
              key={threadIds[index]}
              index={index}
              components={{ ThreadListItem }}
            />
          ))}
        </Fragment>
      ))}
      <ThreadListShowMore />
    </>
  );
};

/** Loads the next page of threads; search only covers pages already loaded. */
const ThreadListShowMore: FC = () => {
  const aui = useAui();
  const hasMore = useAuiState((s) => s.threads.hasMore);
  const isLoadingMore = useAuiState((s) => s.threads.isLoadingMore);
  if (!hasMore) return null;
  return (
    <button
      type="button"
      data-slot="aui_thread-list-show-more"
      disabled={isLoadingMore}
      onClick={() => void aui.threads.loadMore()}
      className="text-ink-faint-sheet hover:bg-hover hover:text-ink focus-visible:outline-focus mt-2 flex h-7 items-center rounded-md px-2 text-start text-sm transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:opacity-60"
    >
      {isLoadingMore ? "Loading…" : "Show more"}
    </button>
  );
};

export const ThreadListNew = forwardRef<
  HTMLButtonElement,
  ComponentPropsWithoutRef<typeof Button> & { labelClassName?: string }
>(({ className, labelClassName, children, ...props }, ref) => {
  return (
    <ThreadListPrimitive.New render={<Button ref={ref} variant="ghost" data-slot="aui_thread-list-new" className={cn(
                "hover:bg-hover h-7 justify-start gap-2 rounded-md px-2 text-sm font-normal",
                className,
              )} {...props} />}>{children ?? (
                <>
                  <Icon.NewChat
                    data-slot="aui_thread-list-new-icon"
                    className="text-ink-muted size-4"
                  />
                  <span
                    data-slot="aui_thread-list-new-label"
                    className={cn("whitespace-nowrap", labelClassName)}
                  >
                    New chat
                  </span>
                </>
              )}</ThreadListPrimitive.New>
  );
});

ThreadListNew.displayName = "ThreadListNew";

const ThreadListSkeleton: FC = () => {
  return (
    <div
      role="status"
      aria-label="Loading threads"
      className="flex flex-col pt-4"
    >
      {Array.from({ length: 6 }, (_, i) => (
        <div
          key={i}
          aria-hidden="true"
          data-slot="aui_thread-list-skeleton-wrapper"
          className="flex h-7 items-center px-2"
        >
          <Skeleton
            data-slot="aui_thread-list-skeleton"
            className="h-3 w-full"
          />
        </div>
      ))}
    </div>
  );
};

type ThreadStatus = "running" | "failed";

const statusLabel: Record<ThreadStatus, string> = {
  running: "Running",
  failed: "Last run failed",
};

const contextMenuItem =
  "data-highlighted:bg-hover flex h-8 cursor-default items-center gap-2 rounded-md px-2 text-sm outline-none select-none";

/**
 * One thread, and under it the branches forked from it. The row is the
 * thread's root branch and each child is a fork, so whichever row is
 * highlighted is the branch the conversation shows. Theorem stores the
 * selection, so opening a row selects its branch and reloads the thread.
 */
export const ThreadListItem: FC = () => {
  const aui = useAui();
  const remoteId = useAuiState((s) => s.threadListItem.remoteId);
  const isRunningHere = useAuiState((s) => s.threadListItem.isRunning);
  const isMain = useAuiState(
    (s) => s.threads.mainThreadId === s.threadListItem.id,
  );
  const [isRenaming, setIsRenaming] = useState(false);
  const [isOpen, setIsOpen] = useState(true);
  const itemRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef(false);

  const seen = useSeen(itemRef);
  const { data: tree } = useThreadTree(remoteId, seen);
  const forks = tree?.forks ?? [];
  const selectBranch = useSelectBranch();
  const queryClient = useQueryClient();

  // The open thread's run is live here; any other thread's comes from Theorem.
  const isRunning = isRunningHere || Boolean(tree?.activeRunId);
  const status: ThreadStatus | undefined = isRunning
    ? "running"
    : tree?.lastRunOutcome === "failed"
      ? "failed"
      : undefined;
  const onFork = tree ? tree.selectedBranchId !== tree.rootBranchId : false;
  const isCurrent = isMain && !onFork;

  // An edit or a regenerate forks the thread, and every run moves its outcome.
  const wasRunningRef = useRef(isRunningHere);
  useEffect(() => {
    if (wasRunningRef.current && !isRunningHere && remoteId) {
      void queryClient.invalidateQueries({ queryKey: threadTreeKey(remoteId) });
    }
    wasRunningRef.current = isRunningHere;
  }, [isRunningHere, remoteId, queryClient]);

  useEffect(() => {
    if (isRenaming || !restoreFocusRef.current) return;
    restoreFocusRef.current = false;
    triggerRef.current?.focus();
  }, [isRenaming]);

  const openBranch = async (branchId: string) => {
    if (!remoteId || !tree) return;
    const changed = tree.selectedBranchId !== branchId;
    if (changed) {
      try {
        await selectBranch.mutateAsync({ threadId: remoteId, branchId });
      } catch {
        // The selection rolls back, so the highlight stays on the branch
        // Theorem still has selected.
        return;
      }
    }
    if (!isMain) aui.threadListItem.switchTo();
    else if (changed) await aui.threads.reloadMainThread();
  };

  return (
    <Collapsible.Root
      ref={itemRef}
      open={isOpen}
      onOpenChange={setIsOpen}
      data-slot="aui_thread-list-item-tree"
    >
      <ContextMenu.Root>
        <ContextMenu.Trigger
          render={
            <ThreadListItemPrimitive.Root
              data-slot="aui_thread-list-item"
              data-active={isCurrent || undefined}
              aria-current={isCurrent || undefined}
              className="group hover:bg-hover has-focus-visible:bg-hover has-data-[state=open]:bg-hover data-popup-open:bg-hover data-active:bg-transparent relative flex h-7 items-center gap-1 rounded-md ps-2 pe-1 text-sm transition-colors duration-100"
            />
          }
        >
          {isRenaming ? (
            <ThreadListItemRename
              onDone={(restoreFocus) => {
                restoreFocusRef.current = restoreFocus;
                setIsRenaming(false);
              }}
            />
          ) : (
            <>
              <ThreadListItemPrimitive.Trigger
                ref={triggerRef}
                data-slot="aui_thread-list-item-trigger"
                onClick={(event) => {
                  // The row is the root branch: reopen it when a fork is selected.
                  if (!tree || !onFork || isRunning) return;
                  event.preventDefault();
                  void openBranch(tree.rootBranchId);
                }}
                className="focus-visible:before:outline-focus min-w-0 truncate text-start outline-none before:absolute before:inset-0 before:rounded-md focus-visible:before:outline-2 focus-visible:before:-outline-offset-2"
              >
                <ThreadListItemPrimitive.Title fallback="New Chat" />
                {status && <span className="sr-only">, {statusLabel[status]}</span>}
              </ThreadListItemPrimitive.Trigger>
              {forks.length > 0 && (
                <Collapsible.Trigger
                  data-slot="aui_thread-list-item-branches-toggle"
                  aria-label={isOpen ? "Hide branches" : "Show branches"}
                  className="group/branches text-ink-faint hover:text-ink focus-visible:outline-focus relative flex size-4 shrink-0 items-center justify-center rounded-sm focus-visible:outline-2"
                >
                  <Icon.Next className="size-2.5 transition-transform duration-150 group-data-panel-open/branches:rotate-90" />
                </Collapsible.Trigger>
              )}
              <span className="flex-1" />
            </>
          )}
          <span className="relative flex size-5 shrink-0 items-center justify-center">
            {status && (
              <span
                aria-hidden="true"
                data-slot="aui_thread-list-item-status"
                className={cn(
                  "size-1.5 rounded-full group-hover:hidden group-has-focus-visible:hidden group-has-data-[state=open]:hidden group-data-popup-open:hidden",
                  status === "running"
                    ? "bg-teal dark:bg-teal-ink animate-pulse"
                    : "bg-ochre",
                )}
              />
            )}
            <ThreadListItemMore onRename={() => setIsRenaming(true)} />
          </span>
        </ContextMenu.Trigger>
        <ContextMenu.Portal>
          <ContextMenu.Positioner className="z-50">
            {/* Focus stays put on close, so a rename's field keeps it. */}
            <ContextMenu.Popup
              finalFocus={false}
              className="bg-popover text-popover-foreground shadow-popover border-separator min-w-36 origin-(--transform-origin) rounded-lg border p-1 outline-none transition-[opacity,scale] duration-100 data-ending-style:scale-95 data-ending-style:opacity-0 data-starting-style:scale-95 data-starting-style:opacity-0"
            >
              <ContextMenu.Item
                className={contextMenuItem}
                onClick={() => setIsRenaming(true)}
              >
                <Icon.Edit className="size-4" />
                Rename
              </ContextMenu.Item>
              <ContextMenu.Item
                className={contextMenuItem}
                onClick={() => aui.threadListItem.archive()}
              >
                <Icon.Archive className="size-4" />
                Archive
              </ContextMenu.Item>
              <ContextMenu.Item
                className={cn(
                  contextMenuItem,
                  "text-error-ink data-highlighted:bg-error-container",
                )}
                onClick={() => aui.threadListItem.delete()}
              >
                <Icon.Delete className="size-4" strokeWidth={1.75} />
                Delete
              </ContextMenu.Item>
            </ContextMenu.Popup>
          </ContextMenu.Positioner>
        </ContextMenu.Portal>
      </ContextMenu.Root>
      {remoteId && forks.length > 0 && (
        <Collapsible.Panel
          data-slot="aui_thread-list-item-branches"
          className="h-(--collapsible-panel-height) overflow-hidden transition-[height] duration-(--duration-glide) ease-glide data-ending-style:h-0 data-ending-style:duration-(--duration-exit) data-ending-style:ease-exit data-starting-style:h-0"
        >
          {forks.map((branch, index) => (
            <ThreadBranchRow
              key={branch.branchId}
              threadId={remoteId}
              branch={branch}
              ordinal={index + 2}
              isLast={index === forks.length - 1}
              isCurrent={isMain && tree?.selectedBranchId === branch.branchId}
              disabled={isRunning}
              onOpen={() => void openBranch(branch.branchId)}
            />
          ))}
        </Collapsible.Panel>
      )}
    </Collapsible.Root>
  );
};

const ThreadBranchRow: FC<{
  threadId: string;
  branch: Theorem.Branch;
  /** Position among the thread's branches, counting the root as 1. */
  ordinal: number;
  isLast: boolean;
  isCurrent: boolean;
  disabled: boolean;
  onOpen: () => void;
}> = ({ threadId, branch, ordinal, isLast, isCurrent, disabled, onOpen }) => {
  const label = useBranchLabel(threadId, branch.branchId);
  return (
    <div data-slot="aui_thread-list-branch" className="relative ps-5">
      {/* The guide runs past every child and turns into the last one. */}
      <span
        aria-hidden="true"
        className={cn(
          "border-control/50 pointer-events-none absolute start-3 top-0 w-2 border-s",
          isLast ? "h-1/2 rounded-es-[5px] border-b" : "h-full",
        )}
      />
      <button
        type="button"
        disabled={disabled}
        data-active={isCurrent || undefined}
        aria-current={isCurrent || undefined}
        onClick={onOpen}
        className="hover:bg-hover focus-visible:outline-focus data-active:bg-transparent flex h-7 w-full min-w-0 items-center rounded-md px-2 text-start text-sm transition-colors duration-100 focus-visible:outline-2 focus-visible:-outline-offset-2 disabled:cursor-default disabled:opacity-60"
      >
        <span className="truncate">{label || `Branch ${ordinal}`}</span>
      </button>
    </div>
  );
};

const ThreadListItemRename: FC<{
  onDone: (restoreFocus: boolean) => void;
}> = ({ onDone }) => {
  const aui = useAui();
  const title = useAuiState((s) => s.threadListItem.title) ?? "";
  const [value, setValue] = useState(title);
  const inputRef = useRef<HTMLInputElement>(null);
  const settledRef = useRef(false);

  useEffect(() => {
    inputRef.current?.select();
  }, []);

  const commit = (restoreFocus: boolean) => {
    if (settledRef.current) return;
    settledRef.current = true;

    const next = value.trim();
    if (!next || next === title) {
      onDone(restoreFocus);
      return;
    }

    // Deferred so a synchronous throw lands on the rejection path too.
    Promise.resolve()
      .then(() => aui.threadListItem.rename(next))
      .then(
        () => onDone(restoreFocus),
        () => {
          settledRef.current = false;
          if (restoreFocus) inputRef.current?.focus();
        },
      );
  };

  const cancel = () => {
    if (settledRef.current) return;
    settledRef.current = true;
    onDone(true);
  };

  return (
    <Input
      ref={inputRef}
      autoFocus
      data-slot="aui_thread-list-item-rename"
      aria-label="Rename thread"
      value={value}
      className="-ms-1.5 h-6 min-w-0 flex-1 rounded-md ps-1.5 text-sm"
      onChange={(event) => setValue(event.target.value)}
      onBlur={() => commit(false)}
      onKeyDown={(event) => {
        if (event.nativeEvent.isComposing || event.nativeEvent.keyCode === 229)
          return;
        if (event.key === "Enter") {
          event.preventDefault();
          commit(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          cancel();
        }
      }}
    />
  );
};

const ThreadListItemMore: FC<{ onRename: () => void }> = ({ onRename }) => {
  return (
    <ThreadListItemMorePrimitive.Root sharedFocusGroup>
      <ThreadListItemMorePrimitive.Trigger render={<Button variant="ghost" size="icon" data-slot="aui_thread-list-item-more" className="data-[state=open]:bg-hover hover:bg-selected absolute inset-0 size-5 rounded-sm p-0 opacity-0 group-hover:opacity-100 group-has-focus-visible:opacity-100 data-[state=open]:opacity-100" />}><Icon.More className="size-3.5" /><span className="sr-only">More options</span></ThreadListItemMorePrimitive.Trigger>
      <ThreadListItemMorePrimitive.Content
        side="right"
        align="start"
        sideOffset={6}
        data-slot="aui_thread-list-item-more-content"
        className="bg-popover text-popover-foreground data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=closed]:animate-out data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 shadow-popover border-separator z-50 min-w-36 overflow-hidden rounded-lg border p-1"
      >
        <ThreadListItemMorePrimitive.Item
          data-slot="aui_thread-list-item-more-item"
          className="hover:bg-hover focus:bg-hover flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none"
          onSelect={onRename}
        >
          <Icon.Edit className="size-4" />
          Rename
        </ThreadListItemMorePrimitive.Item>
        <ThreadListItemPrimitive.Archive render={<ThreadListItemMorePrimitive.Item data-slot="aui_thread-list-item-more-item" className="hover:bg-hover focus:bg-hover flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none" />}><Icon.Archive className="size-4" />Archive
                        </ThreadListItemPrimitive.Archive>
        <ThreadListItemPrimitive.Delete render={<ThreadListItemMorePrimitive.Item data-slot="aui_thread-list-item-more-item" className="text-error-ink hover:bg-error-container focus:bg-error-container flex cursor-pointer items-center gap-2 rounded-md px-2.5 py-1.5 text-sm outline-none select-none" />}><Icon.Delete className="size-4" strokeWidth={1.75} />Delete
                        </ThreadListItemPrimitive.Delete>
      </ThreadListItemMorePrimitive.Content>
    </ThreadListItemMorePrimitive.Root>
  );
};
