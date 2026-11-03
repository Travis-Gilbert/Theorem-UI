import { useEffect, useRef } from 'react'
import type { ElementType, ReactNode } from 'react'

// Marks its element in view once, so CSS can reveal it (.reveal-up in
// styles.css). Without scripts the content is simply shown.
export function useInView<T extends HTMLElement>(threshold = 0.2) {
  const ref = useRef<T>(null)
  useEffect(() => {
    const node = ref.current
    if (!node) return
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting) {
          node.dataset.inview = ''
          observer.disconnect()
        }
      },
      { threshold },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [threshold])
  return ref
}

export function Reveal({
  as: Tag = 'div',
  className = '',
  delay = 0,
  children,
}: {
  as?: ElementType
  className?: string
  delay?: number
  children: ReactNode
}) {
  const ref = useInView<HTMLElement>()
  return (
    <Tag
      ref={ref}
      className={`reveal-up ${className}`}
      style={{ ['--d' as string]: delay }}
    >
      {children}
    </Tag>
  )
}
