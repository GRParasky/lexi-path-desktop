import { useState } from 'react'
import { useTranslation } from 'react-i18next'

/**
 * ImportModal
 *
 * Shown after the user selects an import file and the preview endpoint
 * returns at least one title conflict.
 *
 * Props:
 *   paths      — full list of paths from the file (for the subtitle count)
 *   conflicts  — list of titles that already exist for the current user
 *   importing  — boolean: true while the final import request is in flight
 *   onConfirm  — (resolutions) => void
 *                resolutions: { [originalTitle]: { action, newTitle? } }
 *   onCancel   — () => void
 */
export default function ImportModal({ paths, conflicts, importing, onConfirm, onCancel }) {
  const { t } = useTranslation()

  // Initialise every conflict with 'replace' and a pre-filled duplicate name
  const [resolutions, setResolutions] = useState(() => {
    const init = {}
    for (const title of conflicts) {
      init[title] = { action: 'replace', newTitle: `${title} (2)` }
    }
    return init
  })

  const setAction = (title, action) =>
    setResolutions((prev) => ({ ...prev, [title]: { ...prev[title], action } }))

  const setNewTitle = (title, newTitle) =>
    setResolutions((prev) => ({ ...prev, [title]: { ...prev[title], newTitle } }))

  // All conflicts must have a resolution; duplicates must have a non-empty new name
  const isReady = conflicts.every((title) => {
    const r = resolutions[title]
    if (!r) return false
    if (r.action === 'duplicate') return r.newTitle.trim().length > 0
    return true
  })

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) onCancel()
  }

  return (
    <div className="theater-backdrop" onClick={handleBackdropClick}>
      <div className="clone-dialog import-modal">
        <h3>{t('import.title')}</h3>
        <p className="muted" style={{ fontSize: '0.875rem', marginBottom: '1rem' }}>
          {t('import.subtitle', { count: paths.length })}
        </p>

        <p className="import-modal__warning">
          {t('import.conflictWarning')}
        </p>

        <div className="import-modal__conflicts">
          {conflicts.map((title) => {
            const r = resolutions[title] || { action: 'replace', newTitle: '' }
            return (
              <div key={title} className="import-conflict">
                <p className="import-conflict__title">{title}</p>
                <div className="import-conflict__options">
                  <label className="import-conflict__option">
                    <input
                      type="radio"
                      name={`conflict-${title}`}
                      checked={r.action === 'replace'}
                      onChange={() => setAction(title, 'replace')}
                    />
                    {t('import.replace')}
                  </label>
                  <label className="import-conflict__option">
                    <input
                      type="radio"
                      name={`conflict-${title}`}
                      checked={r.action === 'duplicate'}
                      onChange={() => setAction(title, 'duplicate')}
                    />
                    {t('import.duplicate')}
                  </label>
                </div>
                {r.action === 'duplicate' && (
                  <div className="field" style={{ marginTop: '0.5rem' }}>
                    <label>{t('import.newName')}</label>
                    <input
                      type="text"
                      value={r.newTitle}
                      onChange={(e) => setNewTitle(title, e.target.value)}
                      placeholder={t('import.newNamePlaceholder')}
                      autoFocus
                    />
                  </div>
                )}
              </div>
            )
          })}
        </div>

        <div className="clone-dialog__actions">
          <button className="btn-ghost" onClick={onCancel} disabled={importing}>
            {t('common.cancel')}
          </button>
          <button
            className="btn-primary"
            onClick={() => onConfirm(resolutions)}
            disabled={!isReady || importing}
          >
            {importing ? t('import.importing') : t('import.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}
