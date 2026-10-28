import { forwardRef } from 'react'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'

export const SearchBox = forwardRef<HTMLInputElement>(function SearchBox(_props, ref) {
  const t = useT()
  const query = useAppStore((s) => s.searchQuery)
  const setQuery = useAppStore((s) => s.setSearchQuery)
  return (
    <div className="search" role="search">
      <Icon name="search" />
      <input
        ref={ref}
        type="search"
        className="search__input"
        placeholder={t('search.placeholder')}
        aria-label={t('search.label')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            e.preventDefault()
            if (query) setQuery('')
            else e.currentTarget.blur()
          }
        }}
      />
      <kbd className="kbd search__kbd" aria-hidden="true">
        /
      </kbd>
    </div>
  )
})
