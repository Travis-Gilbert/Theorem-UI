// Adapted from Tailark Veil hero-section/one/header.tsx (MIT; see
// tailark/LICENCE.md): transparent over the hero, frosted once scrolled.
import { useEffect, useState } from 'react'
import { Menu, X } from 'lucide-react'
import { Button } from '@/components/tailark/button'
import { cn } from '@/lib/utils'
import { nav } from '@/content'

export function Logo({ className }: { className?: string }) {
  return (
    <span className={cn('flex items-center gap-2', className)}>
      <svg viewBox="0 0 24 24" aria-hidden className="size-5">
        <path
          d="M5 18 L12 5 L19 18 Z"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <circle cx="12" cy="5" r="2.6" fill="var(--color-primary)" />
        <circle cx="5" cy="18" r="2.2" fill="currentColor" />
        <circle cx="19" cy="18" r="2.2" fill="currentColor" />
      </svg>
      <span className="font-serif text-[22px] leading-none font-medium tracking-tight">
        Theorem
      </span>
    </span>
  )
}

export function Header() {
  const [open, setOpen] = useState(false)
  const [scrolled, setScrolled] = useState(false)
  // Over the dark section the bar takes its colours, rather than frosting
  // cream over night.
  const [overNight, setOverNight] = useState(false)

  useEffect(() => {
    const night = document.getElementById('how')
    const onScroll = () => {
      setScrolled(window.scrollY > 40)
      if (night) {
        const { top, bottom } = night.getBoundingClientRect()
        setOverNight(top < 64 && bottom > 64)
      }
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <header>
      <nav
        data-state={open ? 'active' : undefined}
        className={cn(
          'fixed z-30 w-full text-foreground transition-all duration-300',
          overNight && 'night',
          scrolled && 'border-b bg-background/75 backdrop-blur-lg',
        )}
      >
        <div className="mx-auto max-w-6xl px-6">
          <div className="relative flex flex-wrap items-center justify-between gap-6 py-4 lg:gap-0">
            <div className="flex w-full justify-between gap-6 lg:w-auto">
              <a href="#top" aria-label="Theorem home">
                <Logo />
              </a>
              <button
                onClick={() => setOpen(!open)}
                aria-label={open ? 'Close menu' : 'Open menu'}
                aria-expanded={open}
                className="relative z-20 -m-2.5 -mr-4 block cursor-pointer p-2.5 lg:hidden"
              >
                <Menu className="m-auto size-6 duration-200 in-data-[state=active]:scale-0 in-data-[state=active]:rotate-180 in-data-[state=active]:opacity-0" />
                <X className="absolute inset-0 m-auto size-6 scale-0 -rotate-180 opacity-0 duration-200 in-data-[state=active]:scale-100 in-data-[state=active]:rotate-0 in-data-[state=active]:opacity-100" />
              </button>
            </div>

            <div className="absolute inset-0 m-auto hidden size-fit lg:block">
              <ul className="flex gap-1">
                {nav.map((item) => (
                  <li key={item.href}>
                    <Button
                      nativeButton={false}
                      render={<a href={item.href} />}
                      variant="ghost"
                      size="sm"
                      className="text-[15px]"
                    >
                      {item.label}
                    </Button>
                  </li>
                ))}
              </ul>
            </div>

            <div className="mb-6 hidden w-full flex-wrap items-center justify-end space-y-8 rounded-3xl border bg-background p-6 shadow-2xl shadow-zinc-300/20 in-data-[state=active]:block md:flex-nowrap lg:m-0 lg:flex lg:w-fit lg:gap-6 lg:space-y-0 lg:border-transparent lg:bg-transparent lg:p-0 lg:shadow-none lg:in-data-[state=active]:flex">
              <ul className="space-y-6 text-base lg:hidden">
                {nav.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      onClick={() => setOpen(false)}
                      className="block text-muted-foreground duration-150 hover:text-foreground"
                    >
                      {item.label}
                    </a>
                  </li>
                ))}
              </ul>
              <Button
                nativeButton={false}
                render={<a href="#join" onClick={() => setOpen(false)} />}
                size="sm"
                className="w-full sm:w-auto"
              >
                Join the waitlist
              </Button>
            </div>
          </div>
        </div>
      </nav>
    </header>
  )
}
