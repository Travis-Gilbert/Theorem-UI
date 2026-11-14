// The real settings page and layout over the existing story API transport.
import { useState } from 'react'
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from '@tanstack/react-router'
import { SettingsLayout } from '@/components/settings/settings-frame'
import { Route as AiRoute } from '@/routes/settings/ai'

export function SettingsAiStory() {
  const [router] = useState(() => {
    const root = createRootRoute({
      component: () => (
        <SettingsLayout>
          <Outlet />
        </SettingsLayout>
      ),
    })
    return createRouter({
      routeTree: root.addChildren([
        createRoute({
          getParentRoute: () => root,
          path: '/settings/ai',
          component: AiRoute.options.component,
        }),
      ]),
      history: createMemoryHistory({ initialEntries: ['/settings/ai'] }),
    })
  })
  return <RouterProvider router={router} />
}
