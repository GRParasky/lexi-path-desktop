import { useTranslation } from 'react-i18next'

const LANGUAGES = [
  { code: 'en',    label: 'English' },
  { code: 'pt-BR', label: 'Português (BR)' },
  { code: 'es',    label: 'Español' },
  { code: 'de',    label: 'Deutsch' },
  { code: 'it',    label: 'Italiano' },
  { code: 'fr',    label: 'Français' },
]

export default function LanguageSelector() {
  const { i18n } = useTranslation()

  const handleChange = (e) => {
    const lang = e.target.value
    i18n.changeLanguage(lang)
    localStorage.setItem('language', lang)
  }

  return (
    <select
      className="language-selector"
      value={i18n.language}
      onChange={handleChange}
      aria-label="Select language"
    >
      {LANGUAGES.map(({ code, label }) => (
        <option key={code} value={code}>{label}</option>
      ))}
    </select>
  )
}
