'use client'

import { useState, useEffect } from 'react'

export function useMediaQuery(query: string): boolean {
  // Initializer must stay `false` on server AND first client render so the
  // hydration tree matches; the real value syncs after mount.
  const [matches, setMatches] = useState(false)

  useEffect(() => {
    const mediaQuery = window.matchMedia(query)
    const handler = (event: MediaQueryListEvent) => setMatches(event.matches)

    setMatches(mediaQuery.matches)
    mediaQuery.addEventListener('change', handler)

    return () => mediaQuery.removeEventListener('change', handler)
  }, [query])

  return matches
}

export function useIsMobile(): boolean {
  return useMediaQuery('(max-width: 768px)')
}

export function useIsTablet(): boolean {
  return useMediaQuery('(min-width: 769px) and (max-width: 1280px)')
}

export function useIsDesktop(): boolean {
  return useMediaQuery('(min-width: 1281px)')
}
