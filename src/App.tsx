import { useEffect, useState } from 'react'
import { CalibrationPage } from '@/pages/CalibrationPage'
import { HomePage } from '@/pages/HomePage'
import { MapV2Page } from '@/pages/MapV2Page'

export default function App() {
  const hash = useLocationHash()
  if (hash === '#/map-v2') return <MapV2Page />
  if (import.meta.env.DEV && hash === '#/calibrate') return <CalibrationPage />
  return <HomePage />
}

function useLocationHash(): string {
  const [hash, setHash] = useState(() => window.location.hash)

  useEffect(() => {
    const sync = () => setHash(window.location.hash)
    window.addEventListener('hashchange', sync)
    return () => window.removeEventListener('hashchange', sync)
  }, [])

  return hash
}
