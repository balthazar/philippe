import { useEffect, useRef, useState } from 'react'
import { apiSend } from '@/api.js'
import { useSessionExpired } from './session.js'

/**
 * The legend (the image's "Texte alternatif") edited in place, beside the
 * photograph it belongs to.
 *
 * It used to live only in /admin/media, which meant that fixing one legend
 * while laying out a gallery cost a trip to a list of five hundred thumbnails
 * and a search for the image you were already looking at.
 *
 * Two things follow from the legend belonging to the IMAGE rather than to the
 * gallery item:
 *
 *   - It saves on its own, immediately, not with the article. The article
 *     form sends `image: <id>` and never the image document, so there is no
 *     way to fold this into its save -- and folding it in would also make an
 *     article's unsaved-changes count claim edits it does not own.
 *   - The change is global. The same photograph in another article now reads
 *     the same way, which is the point: one photograph, one legend.
 *
 * Saves on blur rather than per keystroke: this is a PATCH per save, and the
 * legends are whole sentences.
 */
export function ImageLegend({ image, lang, onSaved }) {
  const onSessionExpired = useSessionExpired()
  const stored = image?.alt?.[lang] || ''
  const [value, setValue] = useState(stored)
  const [state, setState] = useState('idle')
  const timer = useRef(null)

  // Follows the image the tile shows: reordering the gallery hands this same
  // component a different image, and the field has to change with it rather
  // than keep the previous tile's text.
  useEffect(() => { setValue(stored); setState('idle') }, [image?._id, lang, stored])

  useEffect(() => () => clearTimeout(timer.current), [])

  const save = async () => {
    if (value === stored) return
    setState('saving')
    try {
      // Both languages sent, with only the edited one replaced: PATCH
      // overwrites `alt` wholesale, so sending just this language would
      // silently blank the other.
      const alt = { ...(image.alt || { fr: '', en: '' }), [lang]: value }
      const updated = await apiSend('PATCH', `/admin/images/${image._id}`, { alt })
      setState('saved')
      onSaved?.(updated)
      clearTimeout(timer.current)
      timer.current = setTimeout(() => setState('idle'), 2000)
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setState('error')
    }
  }

  return (
    <div className={`gallery-editor-tile-legend${state === 'error' ? ' is-error' : ''}`}>
      <input
        type="text"
        value={value}
        aria-label={`Légende de l’image ${lang === 'en' ? '(anglais)' : '(français)'}`}
        placeholder={lang === 'en' ? (image?.alt?.fr || 'Legend') : 'Légende'}
        onChange={(e) => { setValue(e.target.value); setState('idle') }}
        onBlur={save}
        // Enter saves without waiting for a blur; Escape abandons the edit.
        onKeyDown={(e) => {
          if (e.key === 'Enter') { e.preventDefault(); e.currentTarget.blur() }
          if (e.key === 'Escape') { setValue(stored); setState('idle') }
        }}
      />
      {state !== 'idle' && (
        <span className="gallery-editor-tile-legend-state" role="status">
          {state === 'saving' ? '…' : state === 'saved' ? 'enregistré' : 'échec'}
        </span>
      )}
    </div>
  )
}
