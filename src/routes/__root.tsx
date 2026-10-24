import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { MotionRoot } from '@/components/motion'
import { paletteScript } from '@/lib/palette'
import appCss from '../styles.css?url'

interface RouterContext {
  queryClient: QueryClient
}

export const Route = createRootRouteWithContext<RouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Theorem' },
      { name: 'description', content: 'Chat with the Theorem agent.' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
    scripts: [{ children: paletteScript }],
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background text-center">
      <p className="font-heading text-[20px] font-normal tracking-tight">
        Nothing here
      </p>
      <Link to="/" className="text-sm text-link underline underline-offset-2">
        Start a new chat
      </Link>
    </div>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // next-themes sets the .dark class and paletteScript sets data-palette before paint, so the server markup differs by design.
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        {/* Theia, served from this origin, keeps its own theme under `theme`. */}
        <ThemeProvider
          storageKey="theorem-ui-theme"
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <MotionRoot />
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
