import { useTranslation } from 'react-i18next'

// Pure display component — receives percentage (0–100) as a prop.
// No state, no side effects — easy to reuse anywhere.
export default function ProgressBar({ percentage }) {
  const { t } = useTranslation()
  return (
    <div className="progress-bar-wrap">
      <div
        className="progress-bar-fill"
        style={{ width: `${percentage}%` }}
      />
      <span className="progress-label">{t('progress.complete', { percentage })}</span>
    </div>
  )
}
