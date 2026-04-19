import { useEffect, useRef, useState } from 'react'

/** Manages horizontal scroll state and scroll-indicator visibility for a tab header. */
export function useTabsScroll() {
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  useEffect(() => {
    const container = scrollContainerRef.current
    if (!container) return

    let stableCheckCount = 0
    let lastScrollWidth = 0
    let lastClientWidth = 0
    const rafIds = new Set<number>()
    let isCleanedUp = false

    const schedule = (cb: () => void) => {
      if (isCleanedUp) return
      const id = requestAnimationFrame(() => {
        rafIds.delete(id)
        cb()
      })
      rafIds.add(id)
    }

    const checkScroll = () => {
      if (isCleanedUp) return
      const { scrollLeft, scrollWidth, clientWidth } = container
      const threshold = 5
      setCanScrollLeft(scrollLeft > threshold)
      setCanScrollRight(scrollWidth - clientWidth - scrollLeft > threshold)
    }

    const waitForStableLayout = () => {
      if (isCleanedUp) return
      const { scrollWidth, clientWidth } = container
      if (scrollWidth === lastScrollWidth && clientWidth === lastClientWidth) {
        stableCheckCount++
        if (stableCheckCount >= 2) {
          checkScroll()
          return
        }
      } else {
        stableCheckCount = 0
      }
      lastScrollWidth = scrollWidth
      lastClientWidth = clientWidth
      schedule(waitForStableLayout)
    }

    const resizeObserver = new ResizeObserver(() => schedule(checkScroll))
    resizeObserver.observe(container)
    schedule(waitForStableLayout)

    const handleScroll = () => schedule(checkScroll)
    container.addEventListener('scroll', handleScroll, { passive: true })

    const handleWheel = (e: WheelEvent) => {
      if (container.scrollWidth <= container.clientWidth) return
      if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return
      e.preventDefault()
      container.scrollBy({ left: e.deltaY, behavior: 'smooth' })
    }
    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      isCleanedUp = true
      for (const id of rafIds) cancelAnimationFrame(id)
      rafIds.clear()
      resizeObserver.disconnect()
      container.removeEventListener('scroll', handleScroll)
      container.removeEventListener('wheel', handleWheel)
    }
  }, [])

  const scroll = (direction: 'left' | 'right') => {
    scrollContainerRef.current?.scrollBy({
      left: direction === 'left' ? -100 : 100,
      behavior: 'smooth',
    })
  }

  return { scrollContainerRef, canScrollLeft, canScrollRight, scroll }
}
