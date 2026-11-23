import { attractionCategories, type AttractionCategory } from '@/attractions/types'
import { categoryPresentation } from '@/attractions/visitor'

export function AttractionFilters({
  categories,
  showClosed,
  onToggleCategory,
  onToggleClosed,
}: {
  categories: readonly AttractionCategory[]
  showClosed: boolean
  onToggleCategory: (category: AttractionCategory) => void
  onToggleClosed: () => void
}) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Attraction filters">
      {attractionCategories.map((category) => {
        const selected = categories.includes(category.id)
        return (
          <button
            key={category.id}
            type="button"
            aria-pressed={selected}
            onClick={() => onToggleCategory(category.id)}
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold shadow-md ring-1 ring-black/5 ${selected ? 'bg-neutral-900 text-white' : 'bg-white/95 text-neutral-700'}`}
          >
            <span className="inline-flex size-4 items-center justify-center rounded-full text-[10px] text-white" style={{ background: categoryPresentation[category.id].color }}>
              {categoryPresentation[category.id].mark}
            </span>
            {category.label}
          </button>
        )
      })}
      <button
        type="button"
        aria-pressed={showClosed}
        onClick={onToggleClosed}
        className={`rounded-full px-2.5 py-1 text-xs font-semibold shadow-md ring-1 ring-black/5 ${showClosed ? 'bg-neutral-900 text-white' : 'bg-white/95 text-neutral-700'}`}
      >
        Show closed
      </button>
    </div>
  )
}
