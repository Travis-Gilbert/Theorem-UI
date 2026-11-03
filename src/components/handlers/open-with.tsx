// SOURCING: Base UI Menu, as rail.tsx builds its menus (a radio group marks
// the view in use), over the handler registry (plan D13) and the desktop
// host's Finder and default-app calls. Choosing a view reopens the file with
// it through openWorkspaceFile.
import { Menu } from '@base-ui/react/menu'
import type { ReactElement, ReactNode } from 'react'
import { Icon } from '@/components/icons'
import { menuItem, menuPopup } from '@/components/shell/sidebar'
import { hostActions } from '@/lib/handlers/actions'
import {
  handlersFor,
  matchInput,
  useHandlerRegistry,
} from '@/lib/handlers/registry'
import type { FileViewProps } from '@/lib/handlers/types'
import { openWorkspaceFile } from '@/lib/workspace/open'

/**
 * "Open with": the views that open this file first, then every other view,
 * then, on the desktop, Finder and the system's app for the file.
 */
export function OpenWith({
  file,
  properties = null,
  current,
  render,
  children,
}: {
  file: FileViewProps
  /** A Markdown file's properties, when the view has them, for matching. */
  properties?: Record<string, unknown> | null
  /** The id of the handler showing the file. */
  current: string
  /** The trigger, such as a Button. */
  render: ReactElement
  children: ReactNode
}) {
  const handlers = useHandlerRegistry((s) => s.handlers)
  const matching = handlersFor(matchInput(file.entry, properties), handlers)
  const choices = [
    ...matching,
    ...handlers.filter((handler) => !matching.includes(handler)),
  ]
  const host = hostActions(file)

  return (
    <Menu.Root>
      <Menu.Trigger render={render}>{children}</Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner align="end" sideOffset={6} className="z-50">
          <Menu.Popup className={`min-w-52 ${menuPopup}`}>
            <Menu.Group>
              <Menu.GroupLabel className="px-2 pt-1 pb-1.5 text-xs text-ink-faint">
                Open with
              </Menu.GroupLabel>
              <Menu.RadioGroup
                value={current}
                onValueChange={(handler) =>
                  openWorkspaceFile({
                    workspaceId: file.client.workspace.id,
                    path: file.path,
                    handler: String(handler),
                  })
                }
              >
                {choices.map((handler) => (
                  <Menu.RadioItem
                    key={handler.id}
                    value={handler.id}
                    className={`${menuItem} data-checked:font-medium`}
                  >
                    <span className="min-w-0 flex-1 truncate">
                      {handler.label}
                    </span>
                    <Menu.RadioItemIndicator>
                      <Icon.Check className="size-3.5" />
                    </Menu.RadioItemIndicator>
                  </Menu.RadioItem>
                ))}
              </Menu.RadioGroup>
            </Menu.Group>
            {host && (
              <>
                <Menu.Separator className="my-1 h-px bg-separator" />
                <Menu.Item
                  className={menuItem}
                  onClick={() => void host.openWithDefault()}
                >
                  Open in default app
                </Menu.Item>
                <Menu.Item
                  className={menuItem}
                  onClick={() => void host.revealInFinder()}
                >
                  Reveal in Finder
                </Menu.Item>
              </>
            )}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
