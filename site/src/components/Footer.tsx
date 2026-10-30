// Adapted from Tailark Veil footer/one.tsx (MIT; see tailark/LICENCE.md).
import { footer } from '@/content'
import { Logo } from './Header'

export function Footer() {
  return (
    <footer className="py-14 @container">
      <div className="mx-auto max-w-3xl px-6">
        <div className="grid grid-cols-2 gap-8 @sm:grid-cols-4">
          <div className="col-span-2">
            <a href="#top" aria-label="Theorem home">
              <Logo />
            </a>
            <p className="mt-4 max-w-xs text-sm text-muted-foreground">
              {footer.tagline}
            </p>
          </div>
          {footer.columns.map((col) => (
            <div key={col.title}>
              <h3 className="mb-3 text-sm font-medium">{col.title}</h3>
              <ul className="space-y-2">
                {col.links.map((link) => (
                  <li key={link.href}>
                    <a
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 flex flex-wrap items-center justify-between gap-4 border-t pt-8">
          <p className="text-sm text-muted-foreground">&copy; 2026 Theorem</p>
          <p className="font-mono text-xs text-muted-foreground">
            join.theorem.rs
          </p>
        </div>
      </div>
    </footer>
  )
}
