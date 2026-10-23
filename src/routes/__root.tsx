import {
  HeadContent,
  Link,
  Scripts,
  createRootRouteWithContext,
} from '@tanstack/react-router'
import { ThemeProvider } from 'next-themes'
import type { QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'

import { isDesktopDocument } from '@/lib/desktop/host'
import { registerBuiltinHandlers } from '@/lib/handlers/builtins'
import appCss from '../styles.css?url'

// Every view that shows a workspace file asks the registry which handler opens it.
registerBuiltinHandlers()

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
  }),
  shellComponent: RootDocument,
  notFoundComponent: NotFound,
})

function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-3 bg-background text-center">
      <p className="font-heading text-[20px] font-normal tracking-tight">Nothing here</p>
      <Link to="/" className="text-sm text-link underline underline-offset-2">
        Start a new chat
      </Link>
    </div>
  )
}

function RootDocument({ children }: { children: ReactNode }) {
  return (
    // next-themes sets the .dark class before paint, so the server markup differs by design.
    // data-theorem-desktop is DESKTOP_DOCUMENT_ATTRIBUTE: getDesktopHost() reads it.
    <html
      lang="en"
      data-theorem-desktop={isDesktopDocument() ? '' : undefined}
      suppressHydrationWarning
    >
      <head>
        <HeadContent />
      </head>
      <body>
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}
        </ThemeProvider>
        <Scripts />
      </body>
    </html>
  )
}
