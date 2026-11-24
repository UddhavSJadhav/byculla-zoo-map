import { useEffect, useState } from 'react'
import { CalibrationPage } from '@/pages/CalibrationPage'
import { HomePage } from '@/pages/HomePage'
import { MapV2Page } from '@/pages/MapV2Page'

export default function App() {
  const path = usePathname()
  const redirect = resolveRedirect(path, window.location.hash, import.meta.env.DEV)

  useEffect(() => {
    if (redirect) window.location.replace(redirect)
  }, [redirect])

  if (redirect) return null
  if (path === '/legacy-v1') return <HomePage />
  if (import.meta.env.DEV && path === '/admin') return <MapV2Page key="admin" mode="admin" />
  if (import.meta.env.DEV && path === '/calibrate') return <CalibrationPage />
  return <MapV2Page key="visitor" mode="visitor" />
}

function resolveRedirect(path: string, hash: string, dev: boolean): string | null {
  if (path === '/' || path === '') {
    if (hash === '#/admin') return dev ? '/admin' : '/'
    if (hash === '#/legacy-v1') return '/legacy-v1'
    if (hash === '#/calibrate') return dev ? '/calibrate' : '/'
    if (hash === '#/' || hash === '#/map-v2') return '/'
  }
  if (path === '/map-v2') return '/'
  if (!dev && (path === '/admin' || path === '/calibrate')) return '/'
  return null
}

function usePathname(): string {
  const [path, setPath] = useState(() => window.location.pathname)

  useEffect(() => {
    const sync = () => setPath(window.location.pathname)
    window.addEventListener('popstate', sync)
    return () => window.removeEventListener('popstate', sync)
  }, [])

  return path
}
