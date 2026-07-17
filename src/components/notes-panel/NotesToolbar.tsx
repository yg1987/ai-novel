import type { FilterView, NoteEntry } from '../../services/notesStorage'

type ViewMode = 'timeline' | 'grouped'

interface FilterOption {
  value: FilterView
  label: string
}

interface Props {
  notes: NoteEntry[]
  filter: FilterView
  viewMode: ViewMode
  options: FilterOption[]
  countFiltered: (notes: NoteEntry[], filter: FilterView) => number
  onFilterChange: (filter: FilterView) => void
  onViewModeChange: (mode: ViewMode) => void
}

export default function NotesToolbar({ notes, filter, viewMode, options, countFiltered, onFilterChange, onViewModeChange }: Props) {
  return (
    <div className="notes-toolbar">
      <div className="notes-filter">
        {options.map((opt) => (
          <button key={opt.value} className={`tab-btn${filter === opt.value ? ' active' : ''}`} onClick={() => { onFilterChange(opt.value) }}>
            {opt.label}
            <span className="notes-filter-count">
              {' '}{opt.value === 'all' ? notes.length : countFiltered(notes, opt.value)}
            </span>
          </button>
        ))}
      </div>
      <div className="notes-view-toggle">
        <button className={`tab-btn${viewMode === 'timeline' ? ' active' : ''}`} onClick={() => { onViewModeChange('timeline') }}>📋 时间线</button>
        <button className={`tab-btn${viewMode === 'grouped' ? ' active' : ''}`} onClick={() => { onViewModeChange('grouped') }}>📂 按章节</button>
      </div>
    </div>
  )
}
