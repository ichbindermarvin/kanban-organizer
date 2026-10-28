import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'

export type MenuEntry =
  | { type: 'item'; label: string; ariaLabel?: string; onSelect: () => void; icon?: ReactNode; danger?: boolean; disabled?: boolean }
  | { type: 'separator' }
  | { type: 'label'; label: string }

interface MenuProps {
  label: string
  entries: MenuEntry[]
  trigger: ReactNode
  triggerClassName?: string
}

/** Accessible menu button (WAI-ARIA menu pattern) rendered in a fixed-position portal so it is never clipped. */
export function Menu({ label, entries, trigger, triggerClassName = 'icon-btn' }: MenuProps) {
  const [open, setOpen] = useState(false)
  const [position, setPosition] = useState<{ top: number; left: number }>({ top: 0, left: 0 })
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const menuId = useId()

  const close = useCallback((restoreFocus = true) => {
    setOpen(false)
    if (restoreFocus) buttonRef.current?.focus()
  }, [])

  useLayoutEffect(() => {
    if (!open || !buttonRef.current || !menuRef.current) return
    const rect = buttonRef.current.getBoundingClientRect()
    const menuRect = menuRef.current.getBoundingClientRect()
    const below = rect.bottom + 4
    const top = below + menuRect.height > window.innerHeight - 8 ? Math.max(8, rect.top - menuRect.height - 4) : below
    const left = Math.min(Math.max(8, rect.right - menuRect.width), window.innerWidth - menuRect.width - 8)
    setPosition({ top, left })
    menuRef.current.querySelector<HTMLElement>('[role="menuitem"]:not([disabled])')?.focus()
  }, [open])

  useEffect(() => {
    if (!open) return
    const onPointer = (event: PointerEvent) => {
      const target = event.target as Node
      if (!menuRef.current?.contains(target) && !buttonRef.current?.contains(target)) close(false)
    }
    const onScroll = (event: Event) => {
      if (!menuRef.current?.contains(event.target as Node)) close(false)
    }
    document.addEventListener('pointerdown', onPointer, true)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onScroll)
    return () => {
      document.removeEventListener('pointerdown', onPointer, true)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onScroll)
    }
  }, [open, close])

  const onMenuKeyDown = (event: React.KeyboardEvent) => {
    const items = [...(menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]:not([disabled])') ?? [])]
    const index = items.indexOf(document.activeElement as HTMLElement)
    const focus = (i: number) => items[(i + items.length) % items.length]?.focus()
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault()
        focus(index + 1)
        break
      case 'ArrowUp':
        event.preventDefault()
        focus(index - 1)
        break
      case 'Home':
        event.preventDefault()
        focus(0)
        break
      case 'End':
        event.preventDefault()
        focus(items.length - 1)
        break
      case 'Escape':
        event.preventDefault()
        event.stopPropagation()
        close()
        break
      case 'Tab':
        close(false)
        break
    }
  }

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className={triggerClassName}
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={(e) => {
          e.stopPropagation()
          setOpen((v) => !v)
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault()
            setOpen(true)
          }
        }}
      >
        {trigger}
      </button>
      {open &&
        createPortal(
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className="menu"
            style={{ top: position.top, left: position.left }}
            onKeyDown={onMenuKeyDown}
          >
            {entries.map((entry, i) => {
              if (entry.type === 'separator') return <div key={i} role="separator" className="menu__separator" />
              if (entry.type === 'label')
                return (
                  <div key={i} className="menu__label" aria-hidden="true">
                    {entry.label}
                  </div>
                )
              return (
                <button
                  key={i}
                  type="button"
                  role="menuitem"
                  tabIndex={-1}
                  disabled={entry.disabled}
                  aria-label={entry.ariaLabel}
                  className={`menu__item${entry.danger ? ' menu__item--danger' : ''}`}
                  onClick={() => {
                    close()
                    entry.onSelect()
                  }}
                >
                  {entry.icon}
                  <span>{entry.label}</span>
                </button>
              )
            })}
          </div>,
          document.body,
        )}
    </>
  )
}
