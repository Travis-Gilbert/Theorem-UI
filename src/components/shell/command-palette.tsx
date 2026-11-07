// SOURCING: coss ui Command over Base UI Autocomplete in a Base UI Dialog (grouped items, as coss's command dialog example), coss ui Kbd, @tanstack/react-router (navigation), lib/theorem/models (catalog and pick), lib/theorem/catalog (plugins and skills), lib/theorem/organization (threads across every project)
import { useNavigate } from '@tanstack/react-router'
import { useEffect, useMemo } from 'react'
import type { ComponentType, SVGProps } from 'react'
import { create } from 'zustand'
import {
  Command,
  CommandCollection,
  CommandDialog,
  CommandDialogPopup,
  CommandEmpty,
  CommandFooter,
  CommandGroup,
  CommandGroupLabel,
  CommandInput,
  CommandItem,
  CommandList,
  CommandPanel,
  CommandShortcut,
} from '@/components/coss/command'
import { Kbd } from '@/components/coss/kbd'
import { Icon } from '@/components/icons'
import { SETTINGS_GROUPS } from '@/components/settings/sections'
import { useCatalogEntries } from '@/lib/theorem/catalog'
import { modelCatalogIssue, useModelCatalog, usePickedModels } from '@/lib/theorem/models'
import {
  attentionLabel,
  primaryProjectId,
  useOrganization,
} from '@/lib/theorem/organization'
import { useShell } from './shell-state'

type Entry = {
  id: string
  label: string
  /** Shown faint after the label: a model's vendor, a skill's plugin. */
  hint?: string
  /** Extra words the search matches but the row does not show. */
  keywords?: string
  Mark: ComponentType<SVGProps<SVGSVGElement>>
  /** A check after the label, for the picked model. */
  active?: boolean
  run: () => void
}

type Group = { label: string; items: Entry[] }

export const useCommandPalette = create<{
  open: boolean
  setOpen: (open: boolean) => void
}>()((set) => ({ open: false, setOpen: (open) => set({ open }) }))

/** ⌘K or Ctrl+K anywhere opens the palette. */
function useHotkey() {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() === 'k' && (event.metaKey || event.ctrlKey)) {
        event.preventDefault()
        const { open, setOpen } = useCommandPalette.getState()
        setOpen(!open)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

function useGroups(close: () => void): Group[] {
  const navigate = useNavigate()
  const { data: catalog = [], list } = useModelCatalog()
  const defaultName = catalog.find((m) => m.ref === list?.defaultRef)?.name
  const { starred, selected, select } = usePickedModels()
  const { plugins, skills } = useCatalogEntries()
  const { data: organization } = useOrganization()

  return useMemo(() => {
    const go = (to: string) => () => {
      close()
      void navigate({ to })
    }
    const pick = (ref: string | undefined) => () => {
      select(ref)
      close()
    }
    // Starred models first, then every other model Theorem serves.
    const starredSet = new Set(starred)
    const models = [
      ...starred.flatMap((ref) => catalog.filter((m) => m.ref === ref)),
      ...catalog.filter((m) => !starredSet.has(m.ref)),
    ]
    const projectTitle = new Map(
      organization?.projects.map((p) => [p.projectId, p.title]),
    )
    const threads = [...(organization?.threads ?? [])].sort(
      (a, b) =>
        (b.lastMessageAtMs ?? b.createdAtMs) -
        (a.lastMessageAtMs ?? a.createdAtMs),
    )
    const groups: Group[] = [
      {
        label: 'Threads',
        items: threads.map((thread) => {
          const home = primaryProjectId(thread)
          const [reason] = thread.attention.reasons
          return {
            id: `thread:${thread.threadId}`,
            label: thread.title || 'New chat',
            hint: projectTitle.get(home),
            keywords: [
              thread.summary?.text,
              thread.attention.running && 'running',
              reason && `attention ${attentionLabel(reason)}`,
              thread.later && 'later',
            ]
              .filter(Boolean)
              .join(' '),
            Mark: Icon.Conversation,
            run: () => {
              close()
              useShell.getState().setProjectId(home)
              void navigate({
                to: '/c/$threadId',
                params: { threadId: thread.threadId },
              })
            },
          }
        }),
      },
      {
        label: 'Go to',
        items: [
          { id: 'new-chat', label: 'New chat', Mark: Icon.NewChat, run: go('/') },
          ...SETTINGS_GROUPS.flatMap(({ sections }) =>
            sections.map(({ path, label, Mark }) => ({
              id: path,
              label: `Settings: ${label}`,
              Mark,
              run: go(path),
            })),
          ),
        ],
      },
      {
        label: 'Models',
        items: [
          {
            id: 'model:default',
            label: 'Default model',
            hint: defaultName,
            keywords: 'default model',
            Mark: Icon.Model,
            active: !selected,
            run: pick(undefined),
          },
          ...models.map((model) => ({
            id: `model:${model.ref}`,
            label: model.name,
            hint: model.vendor,
            keywords: model.ref,
            Mark: starredSet.has(model.ref) ? Icon.Star : Icon.Model,
            active: selected === model.ref,
            run: pick(model.ref),
          })),
        ],
      },
      {
        label: 'Plugins',
        items: plugins.map((plugin) => ({
          id: `plugin:${plugin.id}`,
          label: plugin.name,
          hint: plugin.description,
          Mark: Icon.Plugin,
          run: go('/settings/ai'),
        })),
      },
      {
        label: 'Skills',
        items: skills.map((skill) => ({
          id: `skill:${skill.id}`,
          label: skill.name,
          hint: skill.plugin,
          keywords: skill.description,
          Mark: Icon.Article,
          run: go('/settings/ai'),
        })),
      },
    ]
    return groups.filter((group) => group.items.length)
  }, [catalog, defaultName, starred, selected, select, plugins, skills, organization, navigate, close])
}

/** The ⌘K palette: places, models, plugins and skills, filtered as the person types. */
export function CommandPalette() {
  useHotkey()
  const { list, error } = useModelCatalog()
  const issue = modelCatalogIssue(list, error)
  const open = useCommandPalette((s) => s.open)
  const setOpen = useCommandPalette((s) => s.setOpen)
  const groups = useGroups(() => setOpen(false))

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandDialogPopup>
        <Command
          items={groups}
          itemToStringValue={(item) => {
            const entry = item as Entry
            return [entry.label, entry.hint, entry.keywords].filter(Boolean).join(' ')
          }}
        >
          <CommandInput placeholder="Search threads, models, plugins, skills and settings" />
          {issue && <p role="alert" className="px-3 py-2 text-sm text-ink-muted">{issue}</p>}
          <CommandPanel>
            <CommandEmpty>Nothing matches.</CommandEmpty>
            <CommandList>
              {(group: Group) => (
                <CommandGroup key={group.label} items={group.items}>
                  <CommandGroupLabel>{group.label}</CommandGroupLabel>
                  <CommandCollection>
                    {(entry: Entry) => (
                      <CommandItem key={entry.id} value={entry} onClick={entry.run}>
                        <entry.Mark className="size-4 shrink-0 text-ink-muted" />
                        <span className="truncate">{entry.label}</span>
                        {entry.hint && (
                          <span className="min-w-0 truncate text-xs text-ink-faint">
                            {entry.hint}
                          </span>
                        )}
                        {entry.active && (
                          <CommandShortcut>
                            <Icon.Check className="size-3.5" />
                          </CommandShortcut>
                        )}
                      </CommandItem>
                    )}
                  </CommandCollection>
                </CommandGroup>
              )}
            </CommandList>
          </CommandPanel>
          <CommandFooter>
            <span className="flex items-center gap-1.5">
              <Kbd>↑</Kbd>
              <Kbd>↓</Kbd>
              to move
            </span>
            <span className="flex items-center gap-1.5">
              <Kbd>↵</Kbd>
              to choose
            </span>
          </CommandFooter>
        </Command>
      </CommandDialogPopup>
    </CommandDialog>
  )
}
