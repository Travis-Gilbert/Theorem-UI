// SOURCING: coss ui Menu over Base UI Menu (MenuRadioGroup / MenuRadioItem for the one choice, MenuLinkItem rendered as a router Link for the settings page, as organize/organized-panel), ui/tooltip over Base UI Tooltip, assistant-ui for the open conversation, lib/theorem/response-styles (the catalog, the selection and the pick held for a conversation that does not exist yet) and lib/theorem/organization (the project it is in)
import { useAuiState } from '@assistant-ui/react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Link } from '@tanstack/react-router'
import { useEffect } from 'react'
import { toastManager } from '@/components/coss/toast'
import {
  Menu,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuLinkItem,
  MenuPopup,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuTrigger,
} from '@/components/coss/menu'
import { COMPOSER_TOOLTIP_DELAY } from '@/components/chat/composer-tools'
import { Icon } from '@/components/icons'
import { useShell } from '@/components/shell/shell-state'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { describeError } from '@/lib/theorem/client'
import {
  primaryProjectId,
  useOrganization,
  useOrganizedViews,
} from '@/lib/theorem/organization'
import {
  inheritedStyle,
  responseStylesQuery,
  usePendingStyle,
  useSelectionMutation,
} from '@/lib/theorem/response-styles'
import type { SelectionSource } from '@/lib/theorem/response-styles'

/** The radio value of "no choice": the conversation follows its default. */
const INHERIT = ''

const FOLLOWS: Readonly<Record<SelectionSource, string>> = {
  conversation: '',
  project: "Follows this project's default",
  account: 'Follows your default',
  builtin: "Follows Theorem's own default",
}

/**
 * The conversation the composer writes to, and the project it is in. The open
 * conversation is the runtime's, which is the route's in chat and the last one
 * open behind Spaces and the IDE. A conversation not yet created has no id and
 * takes the project last used; the inbox is no project, so it has no default.
 */
function useConversation() {
  const threadId = useAuiState((s) => s.threadListItem.remoteId)
  const { data: organization } = useOrganization()
  const views = useOrganizedViews()
  const remembered = useShell((s) => s.projectId)
  const thread = threadId ? views.byId.get(threadId) : undefined
  const projectId = thread ? primaryProjectId(thread) : remembered
  const project =
    threadId && !thread
      ? undefined
      : organization?.projects.find(
          (candidate) =>
            candidate.projectId === projectId && !candidate.isInbox,
        )
  return { threadId: threadId ?? undefined, project }
}

/**
 * The composer's response style menu, beside the model and effort pickers. It
 * names the style the next turn will use, lets the person pick another for this
 * conversation, and sets the project's or their own default. A Theorem that
 * does not serve response styles shows nothing.
 */
export function StylePicker() {
  const { threadId, project } = useConversation()
  // The last catalog stays up while the next conversation's is read, so the
  // picker does not drop out of the toolbar when a first message creates one.
  const catalog = useQuery({
    ...responseStylesQuery({ threadId, projectId: project?.projectId }),
    placeholderData: keepPreviousData,
  })
  const select = useSelectionMutation()
  const pending = usePendingStyle((s) => s.styleId)
  const choosePending = usePendingStyle((s) => s.choose)
  const styles = catalog.data?.styles

  // A pick made before the conversation existed may name a style since deleted.
  useEffect(() => {
    if (styles && pending && !styles.some((style) => style.id === pending))
      choosePending(undefined)
  }, [styles, pending, choosePending])

  if (!catalog.data) return null
  const { selection } = catalog.data
  const fail = (title: string) => (error: unknown) =>
    toastManager.add({
      type: 'error',
      title,
      description: describeError(error),
    })

  // The pick this conversation holds: the one made for it, or, before it exists, the one waiting for its first message.
  const chosen = threadId ? selection.conversation : (pending ?? null)
  const picked = chosen
    ? catalog.data.styles.find((style) => style.id === chosen)
    : undefined
  const effective = picked
    ? { style: picked.id, name: picked.name }
    : selection.effective
  const inherited = inheritedStyle(
    { ...selection, conversation: null },
    catalog.data.styles,
  )

  const choose = (value: string) => {
    const style = value === INHERIT ? null : value
    if (!threadId) choosePending(style ?? undefined)
    else
      select.mutate(
        { scope: 'conversation', threadId, style },
        { onError: fail('Could not change the response style') },
      )
  }
  const makeDefault = (scope: 'project' | 'account') =>
    select.mutate(
      scope === 'project' && project
        ? { scope, projectId: project.projectId, style: effective.style }
        : { scope: 'account', style: effective.style },
      { onError: fail('Could not change the default') },
    )

  return (
    <Menu>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger
            delay={COMPOSER_TOOLTIP_DELAY}
            render={
              <MenuTrigger
                aria-label="Response style"
                disabled={catalog.isPlaceholderData}
                className="flex h-8 min-w-0 items-center gap-1 rounded-md px-2 text-sm text-ink-muted transition-colors duration-100 outline-none hover:bg-hover hover:text-ink focus-visible:outline-2 focus-visible:outline-focus data-disabled:opacity-60 data-popup-open:bg-hover data-popup-open:text-ink"
              />
            }
          >
            <span className="max-w-32 truncate">{effective.name}</span>
            <Icon.UpDown className="size-3.5 shrink-0" />
          </TooltipTrigger>
          <TooltipContent side="top">Response style</TooltipContent>
        </Tooltip>
      </TooltipProvider>
      <MenuPopup side="top" align="end" className="w-72">
        <MenuGroup>
          <MenuGroupLabel>Response style</MenuGroupLabel>
          <MenuRadioGroup
            value={picked ? picked.id : INHERIT}
            onValueChange={choose}
          >
            <MenuRadioItem value={INHERIT} closeOnClick>
              <Entry
                name={`Use my default — ${inherited.name}`}
                note={FOLLOWS[inherited.source]}
              />
            </MenuRadioItem>
            {catalog.data.styles.map((style) => (
              <MenuRadioItem key={style.id} value={style.id} closeOnClick>
                <Entry name={style.name} note={style.description} />
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        </MenuGroup>
        <MenuSeparator />
        {project && (
          <MenuItem
            disabled={selection.project === effective.style}
            onClick={() => makeDefault('project')}
          >
            Set as this project's default
          </MenuItem>
        )}
        <MenuItem
          disabled={selection.account === effective.style}
          onClick={() => makeDefault('account')}
        >
          Set as my default
        </MenuItem>
        <MenuLinkItem render={<Link to="/settings/styles" />}>
          Edit styles…
        </MenuLinkItem>
      </MenuPopup>
    </Menu>
  )
}

function Entry({ name, note }: { name: string; note: string }) {
  return (
    <span className="flex min-w-0 flex-col">
      <span className="truncate">{name}</span>
      {note && (
        <span className="line-clamp-2 text-xs text-ink-faint">{note}</span>
      )}
    </span>
  )
}
