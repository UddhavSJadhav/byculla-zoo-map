export type MapMode = 'explore' | 'street'

interface MapSwitcherProps {
  value: MapMode
  onChange: (value: MapMode) => void
}

const options = [
  { id: 'explore', label: 'Explore Map' },
  { id: 'street', label: 'Street Map' },
] as const

export function MapSwitcher({ value, onChange }: MapSwitcherProps) {
  return (
    <div
      role="group"
      aria-label="Map view"
      className="flex rounded-full bg-white/95 p-1 shadow-md ring-1 ring-black/5 backdrop-blur-sm"
    >
      {options.map((option) => {
        const selected = value === option.id

        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onChange(option.id)}
            className={
              selected
                ? 'rounded-full bg-blue-600 px-3 py-1.5 text-sm font-medium text-white'
                : 'rounded-full px-3 py-1.5 text-sm font-medium text-neutral-700 transition hover:bg-neutral-100'
            }
          >
            {option.label}
          </button>
        )
      })}
    </div>
  )
}
