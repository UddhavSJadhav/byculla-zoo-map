import type { ReactNode } from 'react'

interface AppShellProps {
  title: string
  toolbar?: ReactNode
  map: ReactNode
  panel: ReactNode
  panelClassName?: string
  className?: string
}

export function AppShell({ title, toolbar, map, panel, panelClassName, className }: AppShellProps) {
  return (
    <div className={`relative h-dvh w-full overflow-hidden bg-neutral-100 font-sans text-neutral-900 antialiased ${className ?? ''}`}>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-[1100] px-3 pl-16 pt-[max(0.75rem,env(safe-area-inset-top))]">
        <div className="flex justify-end">
          <div className="pointer-events-auto rounded-full bg-white/95 px-4 py-2 shadow-md ring-1 ring-black/5 backdrop-blur-sm">
            <h1 className="text-sm font-semibold tracking-tight">{title}</h1>
          </div>
        </div>
        {toolbar ? (
          <div className="pointer-events-none mt-2 flex justify-center">
            <div className="pointer-events-auto">{toolbar}</div>
          </div>
        ) : null}
      </header>
      <main className="h-full w-full">{map}</main>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[1000] px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className={`pointer-events-auto mx-auto w-full ${panelClassName ?? 'max-w-md'}`}>{panel}</div>
      </div>
    </div>
  )
}
