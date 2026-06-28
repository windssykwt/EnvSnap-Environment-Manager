import { useRef, useState, useCallback, useEffect } from 'react'

const SIDEBAR_WIDTH_KEY = 'envchanger:sidebarWidth'

/**
 * Manages sidebar width state, drag-to-resize behavior, and persistence.
 */
export function useSidebarResize() {
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    try {
      return parseInt(localStorage.getItem(SIDEBAR_WIDTH_KEY) ?? '', 10) || 320
    } catch {
      return 320
    }
  })

  const sidebarWidthRef = useRef(sidebarWidth)
  sidebarWidthRef.current = sidebarWidth

  const resizeRef = useRef<HTMLDivElement | null>(null)

  const handleResizeStart = useCallback((e: globalThis.MouseEvent) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = sidebarWidthRef.current

    const handleMouseMove = (me: globalThis.MouseEvent) => {
      const newWidth = Math.max(200, Math.min(500, startWidth + me.clientX - startX))
      setSidebarWidth(newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = ''
      localStorage.setItem(SIDEBAR_WIDTH_KEY, String(sidebarWidthRef.current))
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.body.style.cursor = 'col-resize'
  }, [])

  useEffect(() => {
    const el = resizeRef.current
    if (!el) return
    el.addEventListener('mousedown', handleResizeStart)
    return () => el.removeEventListener('mousedown', handleResizeStart)
  }, [handleResizeStart])

  return { sidebarWidth, sidebarWidthRef, resizeRef }
}
