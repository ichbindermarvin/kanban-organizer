import { de as deLocale, enUS } from 'date-fns/locale'
import type { Locale as DateLocale } from 'date-fns'
import type { Locale } from '@/features/tasks/models/schemas'
import { de, type TranslationKey } from './de'
import { en } from './en'

export type { TranslationKey }
export type Translate = (key: TranslationKey, params?: Record<string, string | number>) => string

const DICTIONARIES: Record<Locale, Record<TranslationKey, string>> = { de, en }
const DATE_LOCALES: Record<Locale, DateLocale> = { de: deLocale, en: enUS }

export function translate(locale: Locale, key: TranslationKey, params?: Record<string, string | number>): string {
  const template = DICTIONARIES[locale][key] ?? de[key] ?? key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name]) : match))
}

export function createTranslator(locale: Locale): Translate {
  return (key, params) => translate(locale, key, params)
}

export function dateLocale(locale: Locale): DateLocale {
  return DATE_LOCALES[locale]
}
