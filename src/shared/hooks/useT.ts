import { useMemo } from 'react'
import { useAppStore } from '@/state/appStore'
import { createTranslator } from '@/shared/i18n'

export function useT() {
  const locale = useAppStore((s) => s.settings.locale)
  return useMemo(() => createTranslator(locale), [locale])
}

export function useLocale() {
  return useAppStore((s) => s.settings.locale)
}
