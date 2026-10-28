import { useRef } from 'react'
import { CARD_COLORS, type CardColor } from '@/features/tasks/models/schemas'
import { useT } from '@/shared/hooks/useT'
import { Icon } from '@/shared/components/Icon'

const OPTIONS: (CardColor | undefined)[] = [undefined, ...CARD_COLORS]

/** Radio group of color swatches (arrow keys move the selection, like native radios). */
export function ColorPicker({ value, onChange, labelledBy }: { value: CardColor | undefined; onChange: (color: CardColor | undefined) => void; labelledBy: string }) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const current = OPTIONS.indexOf(value)

  return (
    <div ref={ref} className="swatches" role="radiogroup" aria-labelledby={labelledBy}>
      {OPTIONS.map((color, index) => {
        const label = color ? t(`color.${color}`) : t('color.none')
        const checked = index === current
        return (
          <button
            key={color ?? 'none'}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={label}
            title={label}
            tabIndex={checked ? 0 : -1}
            className={`swatch${color ? ` color-${color}` : ' swatch--none'}`}
            onClick={() => onChange(color)}
            onKeyDown={(e) => {
              const delta = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
              if (!delta) return
              e.preventDefault()
              const next = (index + delta + OPTIONS.length) % OPTIONS.length
              onChange(OPTIONS[next])
              requestAnimationFrame(() => ref.current?.querySelectorAll<HTMLElement>('[role="radio"]')[next]?.focus())
            }}
          >
            {checked && <Icon name="check" size={12} />}
          </button>
        )
      })}
    </div>
  )
}
