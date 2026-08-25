import { useId } from 'react'

/**
 * French is the base value and is never empty (Article.slug/title/etc. all
 * default fr to ''). English is an optional override: an empty English
 * value means "fall back to French", which is exactly what a reader gets
 * (localize() reads `field[lang] || field.fr`), so the placeholder shows the
 * French text rather than inventing a copy of it. That also means reverting
 * an override must clear `en`, never write the French string into it --
 * doing that would silently freeze the field against future French edits.
 *
 * `warning` is any node to render under the field. It is deliberately not a
 * validation state: nothing here blocks a save, and the field keeps its
 * normal styling, because every warning this project raises is advice about
 * a URL rather than a rule about a form.
 */
export function LocalizedInput({ label, lang, value = { fr: '', en: '' }, onChange, multiline = false, warning = null }) {
  const id = useId()
  const isOverride = lang === 'en'
  const current = value[lang] || ''
  const Tag = multiline ? 'textarea' : 'input'

  return (
    <div className={`localized-input${isOverride && current ? ' is-overridden' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <Tag
        id={id}
        value={current}
        placeholder={isOverride ? value.fr || '' : ''}
        onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
      />
      {isOverride && current && (
        <button type="button" className="revert-button" onClick={() => onChange({ ...value, en: '' })}>
          Revenir au français
        </button>
      )}
      {warning}
    </div>
  )
}
