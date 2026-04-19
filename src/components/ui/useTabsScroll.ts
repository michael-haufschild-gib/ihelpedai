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
    let rafId: number | null = null
    let isCleanedUp = false

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
      rafId = requestAnimationFrame(waitForStableLayout)
    }

    const resizeObserver = new ResizeObserver(() => {
      if (!isCleanedUp) rafId = requestAnimationFrame(checkScroll)
    })
    resizeObserver.observe(container)
    rafId = requestAnimationFrame(waitForStableLayout)

    const handleScroll = () => {
      if (!isCleanedUp) rafId = requestAnimationFrame(checkScroll)
    }
    container.addEventListener('scroll', handleScroll, { passive: true })

    const handleWheel = (e: WheelEvent) => {
      if (container.scrollWidth <= container.clientWidth) return
      e.preventDefault()
      container.scrollBy({ left: e.deltaY, behavior: 'smooth' })
    }
    container.addEventListener('wheel', handleWheel, { passive: false })

    return () => {
      isCleanedUp = true
      if (rafId !== null) cancelAnimationFrame(rafId)
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
