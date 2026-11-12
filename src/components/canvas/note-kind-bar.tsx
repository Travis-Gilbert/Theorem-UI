// SOURCING: coss ui toolbar (Base UI Toolbar: arrow-key roving focus), coss menu and tooltip, translated from the bottom bar of Obsidian Canvas in docs/plans/evidence/refs/canvas-note-types@2026-11-05.png. Six entries rather than one per kind: the kinds that are Markdown blocks sit in the Note menu, so the bar stays the size of the reference's.
import type { ComponentType, ReactElement } from 'react'
import { Icon } from '@/components/icons'
import {
  Menu,
  MenuGroupLabel,
  MenuGroup,
  MenuItem,
  MenuPopup,
  MenuSeparator,
  MenuTrigger,
} from '@/components/coss/menu'
import { Toolbar, ToolbarButton } from '@/components/coss/toolbar'
import {
  Tooltip,
  TooltipPopup,
  TooltipTrigger,
} from '@/components/coss/tooltip'
import { Button } from '@/components/ui/button'
import type { BlockRequest } from '@/components/notes/kinds/pickers'
import { KIND_LABEL } from '@/lib/theorem/note-kinds'
import type { NoteKind } from '@/lib/theorem/note-kinds'

export type BarAction =
  | { type: 'text' }
  | { type: 'kind'; kind: NoteKind }
  | { type: 'request'; request: BlockRequest }
  | { type: 'canvas' }
  | { type: 'group' }

const KINDS: ReadonlyArray<{
  kind: NoteKind
  ItemIcon: ComponentType<{ className?: string }>
}> = [
  { kind: 'checklist', ItemIcon: Icon.Checklist },
  { kind: 'table', ItemIcon: Icon.Table },
  { kind: 'code', ItemIcon: Icon.Code },
  { kind: 'json', ItemIcon: Icon.Json },
  { kind: 'math', ItemIcon: Icon.Sigma },
  { kind: 'diagram', ItemIcon: Icon.Diagram },
  { kind: 'data', ItemIcon: Icon.Columns },
]

const barButton = (label: string): ReactElement => (
  <ToolbarButton
    render={<Button size="icon-lg" variant="ghost" aria-label={label} className="size-11" />}
  />
)

function Entry({
  label,
  ItemIcon,
  onClick,
}: {
  label: string
  ItemIcon: ComponentType<{ className?: string }>
  onClick: () => void
}) {
  return (
    <Tooltip>
      <TooltipTrigger render={barButton(label)} onClick={onClick}>
        <ItemIcon className="size-6" />
      </TooltipTrigger>
      <TooltipPopup side="top">{label}</TooltipPopup>
    </Tooltip>
  )
}

/** The kinds of note there are, for any menu that starts one. */
export function NoteMenuItems({
  onAction,
}: {
  onAction: (action: BarAction) => void
}) {
  return (
    <>
      <MenuItem onClick={() => onAction({ type: 'kind', kind: 'note' })}>
        <Icon.NewNote />
        New note
      </MenuItem>
      <MenuItem onClick={() => onAction({ type: 'request', request: 'note' })}>
        <Icon.Search />
        Existing note…
      </MenuItem>
      <MenuSeparator />
      <MenuGroup>
        <MenuGroupLabel>Starts as</MenuGroupLabel>
        {KINDS.map(({ kind, ItemIcon }) => (
          <MenuItem key={kind} onClick={() => onAction({ type: 'kind', kind })}>
            <ItemIcon />
            {KIND_LABEL[kind]}
          </MenuItem>
        ))}
      </MenuGroup>
      <MenuSeparator />
      <MenuItem onClick={() => onAction({ type: 'request', request: 'thread' })}>
        <Icon.Chat />
        Conversation…
      </MenuItem>
      <MenuItem
        onClick={() => onAction({ type: 'request', request: 'artifact' })}
      >
        <Icon.Artifact />
        App or artifact…
      </MenuItem>
    </>
  )
}

/** What can be added to the canvas. */
export function NoteKindBar({ onAction }: { onAction: (action: BarAction) => void }) {
  return (
    <Toolbar
      aria-label="Add to the canvas"
      className="items-center gap-1.5 border-separator bg-raised text-ink shadow-md"
    >
      <Entry
        label="Text card"
        ItemIcon={Icon.File}
        onClick={() => onAction({ type: 'text' })}
      />
      <Menu>
        <Tooltip>
          <TooltipTrigger render={<MenuTrigger render={barButton('Note')} />}>
            <Icon.Note className="size-6" />
          </TooltipTrigger>
          <TooltipPopup side="top">Note</TooltipPopup>
        </Tooltip>
        <MenuPopup side="top" sideOffset={8}>
          <NoteMenuItems onAction={onAction} />
        </MenuPopup>
      </Menu>
      <Entry
        label="Image, audio, video or PDF"
        ItemIcon={Icon.Image}
        onClick={() => onAction({ type: 'request', request: 'media' })}
      />
      <Entry
        label="Link"
        ItemIcon={Icon.Web}
        onClick={() => onAction({ type: 'request', request: 'link' })}
      />
      <Entry
        label="Canvas"
        ItemIcon={Icon.Canvas}
        onClick={() => onAction({ type: 'canvas' })}
      />
      <Entry
        label="Group"
        ItemIcon={Icon.Group}
        onClick={() => onAction({ type: 'group' })}
      />
    </Toolbar>
  )
}
