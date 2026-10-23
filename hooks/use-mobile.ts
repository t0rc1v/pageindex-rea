import * as React from "react"

const MOBILE_BREAKPOINT = 768
const QUERY = `(max-width: ${MOBILE_BREAKPOINT - 1}px)`

/**
 * Viewport check for shadcn's Sidebar. Implemented with useSyncExternalStore so
 * the media query is a subscription rather than state written from an effect
 * (which the React Compiler lint rules reject).
 */
export function useIsMobile(): boolean {
  return React.useSyncExternalStore(
    (onChange) => {
      const query = window.matchMedia(QUERY)
      query.addEventListener("change", onChange)
      return () => query.removeEventListener("change", onChange)
    },
    () => window.matchMedia(QUERY).matches,
    () => false,
  )
}
