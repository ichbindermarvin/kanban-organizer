import type { CardColor, Settings } from '@/features/tasks/models/schemas'
import type { Translate } from '@/shared/i18n'

/** Display name of a color: the user's meaning if set ("Arbeit"), otherwise the color name ("Blau"). */
export function colorName(color: CardColor, settings: Pick<Settings, 'colorLabels'>, t: Translate): string {
  return settings.colorLabels?.[color]?.trim() || t(`color.${color}`)
}

/** "Blau – Arbeit" when a meaning is set, otherwise just "Blau". */
export function colorDescription(color: CardColor, settings: Pick<Settings, 'colorLabels'>, t: Translate): string {
  const label = settings.colorLabels?.[color]?.trim()
  return label ? `${t(`color.${color}`)} – ${label}` : t(`color.${color}`)
}
