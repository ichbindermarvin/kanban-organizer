import { useMemo } from 'react'
import { CARD_COLORS } from '@/features/tasks/models/schemas'
import { useAppStore } from '@/state/appStore'
import { useT } from '@/shared/hooks/useT'
import type { ColorSearchTerms } from './searchTasks'

/** Color name plus the user's meaning for every color, in the current language. */
export function useColorSearchTerms(): ColorSearchTerms {
  const t = useT()
  const labels = useAppStore((s) => s.settings.colorLabels)
  return useMemo(() => Object.fromEntries(CARD_COLORS.map((color) => [color, `${t(`color.${color}`)} ${labels?.[color] ?? ''}`])), [t, labels])
}
