import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import enCommon from './locales/en/common.json';
import koCommon from './locales/ko/common.json';

export type SupportedLanguage = 'ko' | 'en';

const LANGUAGE_STORAGE_KEY = 'omni.language';
const FALLBACK_LANGUAGE: SupportedLanguage = 'ko';
const SUPPORTED_LANGUAGES: SupportedLanguage[] = ['ko', 'en'];

function normalizeLanguage(language: string | null | undefined): SupportedLanguage | null {
  if (!language) {
    return null;
  }

  const normalizedLanguage = language.toLowerCase().split('-')[0];

  if (SUPPORTED_LANGUAGES.includes(normalizedLanguage as SupportedLanguage)) {
    return normalizedLanguage as SupportedLanguage;
  }

  return null;
}

async function getPreferredLanguage(): Promise<SupportedLanguage> {
  const storedLanguage = normalizeLanguage(window.localStorage.getItem(LANGUAGE_STORAGE_KEY));

  if (storedLanguage) {
    return storedLanguage;
  }

  try {
    const appLocale = normalizeLanguage(await window.omni?.getAppLocale());

    if (appLocale) {
      return appLocale;
    }
  } catch {
    // Fall back to browser language below when Electron locale is unavailable.
  }

  return normalizeLanguage(window.navigator.language) ?? FALLBACK_LANGUAGE;
}

export function getCurrentLanguage(): SupportedLanguage {
  return normalizeLanguage(i18n.language) ?? FALLBACK_LANGUAGE;
}

export function saveLanguagePreference(language: SupportedLanguage): void {
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export async function initI18n(): Promise<typeof i18n> {
  const preferredLanguage = await getPreferredLanguage();

  if (i18n.isInitialized) {
    await i18n.changeLanguage(preferredLanguage);
    return i18n;
  }

  await i18n.use(initReactI18next).init({
    resources: {
      ko: {
        common: koCommon,
      },
      en: {
        common: enCommon,
      },
    },
    lng: preferredLanguage,
    fallbackLng: FALLBACK_LANGUAGE,
    supportedLngs: SUPPORTED_LANGUAGES,
    defaultNS: 'common',
    ns: ['common'],
    interpolation: {
      escapeValue: false,
    },
  });

  return i18n;
}

export { i18n, LANGUAGE_STORAGE_KEY, SUPPORTED_LANGUAGES };
