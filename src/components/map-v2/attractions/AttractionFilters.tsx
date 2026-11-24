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
            className={`inline-flex min-h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold ring-1 ring-neutral-300 ${selected ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-950'}`}
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
        className={`inline-flex min-h-11 items-center rounded-full px-3 text-sm font-semibold ring-1 ring-neutral-300 ${showClosed ? 'bg-neutral-900 text-white' : 'bg-white text-neutral-950'}`}
      >
        Show closed
      </button>
    </div>
  )
}
