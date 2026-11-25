import { lazy, Suspense, useEffect, useState } from 'react'
import { MapV2Page } from '@/pages/MapV2Page'

const HomePage = lazy(() => import('@/pages/HomePage').then((module) => ({ default: module.HomePage })))
const CalibrationPage = lazy(() => import('@/pages/CalibrationPage').then((module) => ({ default: module.CalibrationPage })))

function RouteFallback() {
  return (
    <div className="flex h-dvh items-center justify-center bg-[#f4ead7] text-sm font-medium text-neutral-700" role="status">
      Loading…
    </div>
  )
}

export default function App() {
  const path = usePathname()
  const redirect = resolveRedirect(path, window.location.hash, import.meta.env.DEV)

  useEffect(() => {
    if (redirect) window.location.replace(redirect)
  }, [redirect])

  if (redirect) return null
  if (path === '/legacy-v1') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <HomePage />
      </Suspense>
    )
  }
  if (import.meta.env.DEV && path === '/admin') return <MapV2Page key="admin" mode="admin" />
  if (import.meta.env.DEV && path === '/calibrate') {
    return (
      <Suspense fallback={<RouteFallback />}>
        <CalibrationPage />
      </Suspense>
    )
  }
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
