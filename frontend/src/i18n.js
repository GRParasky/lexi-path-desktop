import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import en from './locales/en.json'
import ptBR from './locales/pt-BR.json'
import es from './locales/es.json'
import de from './locales/de.json'
import it from './locales/it.json'
import fr from './locales/fr.json'

i18n
  .use(initReactI18next)
  .init({
    resources: {
      en:    { translation: en },
      'pt-BR': { translation: ptBR },
      es:    { translation: es },
      de:    { translation: de },
      it:    { translation: it },
      fr:    { translation: fr },
    },
    // Read persisted choice from localStorage; fall back to English
    lng: localStorage.getItem('language') || 'en',
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false, // React already escapes values
    },
  })

export default i18n
