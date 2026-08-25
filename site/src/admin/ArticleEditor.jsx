import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { apiGet, apiSend } from '@/api.js'
import { routeFor } from '@/routes.js'
import { useSessionExpired } from './session.js'
import { LocalizedInput } from './LocalizedInput.jsx'
import { deriveSortYears } from './yearRange.js'
import { slugify, slugWarning } from './slug.js'
import { BlockEditor } from './BlockEditor.jsx'
import { ArticlePreview } from './ArticlePreview.jsx'
import { ExternalLinkIcon, WarningIcon } from './icons.jsx'
import { ConfirmDelete } from './ConfirmDelete.jsx'
import { countUnsavedChanges } from './unsavedChanges.js'

const STATUS_LABELS = { draft: 'Brouillon', published: 'Publié' }

// Matches api/src/lib/constants.js CATEGORIES; duplicated rather than
// imported for the same reason ArticleList.jsx duplicates it: the admin is a
// separate bundle from the API and this is a small, stable, display-only list.
const CATEGORY_LABELS = {
  works: 'Œuvres',
  exhibitions: 'Expositions',
  editions: 'Éditions',
  'public-orders': 'Commandes publiques',
}

const EMPTY_ARTICLE = {
  title: { fr: '', en: '' },
  subtitle: { fr: '', en: '' },
  yearLabel: { fr: '', en: '' },
  slug: { fr: '', en: '' },
  category: 'works',
  yearStart: '',
  yearEnd: '',
  cover: null,
  blocks: [],
  status: 'draft',
}

const SLUG_LANG_LABELS = { fr: 'Slug français', en: 'Slug anglais' }

/**
 * Both slugs at once, never only the tab being shown. The language switch
 * hides the other slug completely, so an English slug with a problem would
 * sit there unseen -- and it is a real public URL (/en/<slug>), not a
 * translation nicety.
 *
 * Suggestions are buttons rather than prose: the fix for a slug is always a
 * specific string, and asking someone to retype it by hand from a sentence
 * is how a second typo gets in.
 */
function SlugWarnings({ slug, onApply }) {
  const issues = ['fr', 'en']
    .map((lang) => ({ lang, issue: slugWarning(slug?.[lang]) }))
    .filter(({ issue }) => issue)

  if (!issues.length) return null

  return (
    <div className="slug-warnings">
      {issues.map(({ lang, issue }) => (
        <div key={lang} className="slug-warning">
          <WarningIcon className="slug-warning-icon" />
          <p>
            <strong>{SLUG_LANG_LABELS[lang]}</strong> : {issue.message}
          </p>
          {issue.suggestions.length > 0 && (
            <p className="slug-suggestions">
              {issue.suggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="slug-suggestion"
                  onClick={() => onApply(lang, suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

export function ArticleEditor({ onUnsavedCountChange } = {}) {
  const { id } = useParams()
  const navigate = useNavigate()
  const onSessionExpired = useSessionExpired()

  const [article, setArticle] = useState(EMPTY_ARTICLE)
  // Task 28: the snapshot `article` is compared against to count unsaved
  // changes -- set once the article loads, and again after every
  // successful save (create or update), never touched by `update()`
  // itself. `null` until a real snapshot exists (a brand-new, unsaved
  // article has nothing to diff against yet, so its count is 0 -- see
  // countUnsavedChanges' own `!saved` guard).
  const [lastSaved, setLastSaved] = useState(id ? null : EMPTY_ARTICLE)
  const [lang, setLang] = useState('fr')
  // Whether the French slug is the artist's to keep or the title's to
  // follow. An article that already has one has claimed it -- see
  // updateTitle below for why that matters more than the convenience does.
  const [slugLocked, setSlugLocked] = useState(false)
  const [loading, setLoading] = useState(Boolean(id))
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const [statusBusy, setStatusBusy] = useState(false)
  const [deleteBusy, setDeleteBusy] = useState(false)

  const unsavedCount = useMemo(() => countUnsavedChanges(article, lastSaved), [article, lastSaved])

  // Covers closing the tab, reloading, and navigating to a typed/external
  // URL -- the only cases a plain <BrowserRouter> app (no data router, so
  // no useBlocker) can guard at the browser level at all. In-app
  // navigation (the admin nav's own links) is guarded separately, in
  // Admin.jsx, via onUnsavedCountChange below; browser back/forward is
  // NOT covered by either (see the task report).
  useEffect(() => {
    if (!unsavedCount) return undefined
    const handler = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [unsavedCount])

  // Mirrors ArticleDetail's onTranslatedPath wiring in App.jsx: a live
  // value reported up to an ancestor (here, Admin.jsx's nav) that only
  // this mounted child actually knows, cleared on unmount so a stale count
  // never survives into whatever admin route is visited next.
  useEffect(() => {
    onUnsavedCountChange?.(unsavedCount)
    return () => onUnsavedCountChange?.(0)
  }, [unsavedCount, onUnsavedCountChange])

  useEffect(() => {
    if (!id) return
    let cancelled = false
    apiGet(`/admin/articles/${id}`)
      .then((data) => {
        if (cancelled) return
        setArticle(data)
        setLastSaved(data)
        setSlugLocked(Boolean(data.slug?.fr))
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoading(false)
        if (err?.status === 401) onSessionExpired()
        else setError("Impossible de charger cet article.")
      })
    return () => { cancelled = true }
  }, [id, onSessionExpired])

  const update = (patch) => {
    setArticle((prev) => ({ ...prev, ...patch }))
    setSaved(false)
  }

  /**
   * The slug follows the title only while nobody has claimed it. A brand-new
   * article gets one as it is typed (the API would otherwise derive the same
   * string on save, out of sight); an article that already has a slug keeps
   * it, whatever its title becomes later.
   *
   * That second half is the important one. A slug is the article's public
   * address, the one the old WordPress site's inbound links and search
   * ranking point at, so renaming a work must never quietly move its page.
   *
   * French only, matching the API's own ensureSlug: an empty `slug.en` means
   * "use the French one", so filling it in would invent a separate English
   * URL for an article that never asked for one.
   */
  const updateTitle = (title) => {
    if (slugLocked) return update({ title })
    return update({ title, slug: { ...article.slug, fr: slugify(title.fr) } })
  }

  // Typing a slug claims it; emptying the field hands it back, so the field
  // starts following the title again instead of staying stuck blank.
  const updateSlug = (slug) => {
    setSlugLocked(Boolean(slug.fr))
    update({ slug })
  }

  const save = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    const payload = {
      ...article,
      // article.cover is populated (an object) right after a GET, but PATCH
      // used to return it as a bare id -- see the api-side populate fix in
      // admin.js. `?._id || article.cover` keeps this correct either way,
      // matching the fallback the line below already uses for block images.
      cover: article.cover?._id || article.cover || null,
      yearStart: article.yearStart === '' ? undefined : Number(article.yearStart),
      yearEnd: article.yearEnd === '' ? undefined : Number(article.yearEnd),
      blocks: article.blocks.map((block) => ({
        ...block,
        image: block.image?._id || block.image || undefined,
        items: block.items?.map((item) => ({ ...item, image: item.image?._id || item.image || undefined })),
      })),
    }
    try {
      if (id) {
        const updated = await apiSend('PATCH', `/admin/articles/${id}`, payload)
        setArticle(updated)
        setLastSaved(updated)
      } else {
        const created = await apiSend('POST', '/admin/articles', payload)
        // Swap to the edit route for the article that now exists, so a
        // second save PATCHes it instead of creating a duplicate.
        navigate(`/admin/articles/${created._id}`, { replace: true })
        setArticle(created)
        setLastSaved(created)
      }
      setSaved(true)
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      // A slug now always leaves this editor filled in (updateTitle derives
      // one), where it used to arrive empty and let the API invent a unique
      // one. So a collision with another article's slug reaches the client
      // as a 409 instead of being silently resolved into "titre-2", and
      // saying which field is at fault beats a generic failure the artist
      // can only respond to by trying again.
      else if (err?.status === 409) setError('Ce slug est déjà utilisé par un autre article.')
      else setError("Impossible d'enregistrer cet article.")
    } finally {
      setSaving(false)
    }
  }

  // Task 25, client feedback item 3: the artist looked for publish/unpublish
  // in the editor and only found it in the article list. Immediate PATCH
  // (like the list's own toggle), separate from the full-form "Enregistrer"
  // flow, so flipping status never bundles in unrelated unsaved edits and
  // never silently requires remembering to also click Save.
  const togglePublish = async () => {
    setError('')
    setStatusBusy(true)
    const status = article.status === 'published' ? 'draft' : 'published'
    try {
      const updated = await apiSend('PATCH', `/admin/articles/${id}`, { status })
      setArticle((prev) => ({ ...prev, status: updated.status }))
      // Already persisted by this PATCH, not a pending edit: without this,
      // the unsaved-changes count would read "1" for `status` immediately
      // after publishing/unpublishing, even though nothing is actually
      // unsaved.
      setLastSaved((prev) => (prev ? { ...prev, status: updated.status } : prev))
    } catch (err) {
      if (err?.status === 401) onSessionExpired()
      else setError("Impossible de changer le statut de cet article.")
    } finally {
      setStatusBusy(false)
    }
  }

  // DELETE existed on the API (api/src/routes/admin.js) with nothing in the
  // UI calling it. ConfirmDelete gates this behind an in-page confirmation
  // naming the article, never a browser confirm().
  const deleteArticle = async () => {
    setError('')
    setDeleteBusy(true)
    try {
      await apiSend('DELETE', `/admin/articles/${id}`)
      navigate('/admin')
    } catch (err) {
      setDeleteBusy(false)
      if (err?.status === 401) onSessionExpired()
      else setError('Impossible de supprimer cet article.')
    }
  }

  if (loading) return null

  // Task 27, Part A: every article lives at the root now (/:slug), the same
  // for every category, so routeFor's first argument is moot here -- it
  // only ever selects a section's own segment, and that never happens once
  // a slug is given.
  const slug = article.slug?.[lang] || article.slug?.fr || ''
  // A draft, or an article with no slug yet, has no public page: GET
  // /articles/:slug only ever resolves a published article, so a link built
  // for either case would 404.
  const canLinkLive = article.status === 'published' && Boolean(slug)
  const liveUrl = canLinkLive ? routeFor('article', lang, slug) : null
  const noLiveLinkReason = !slug
    ? "Cet article n'a pas encore de slug : pas de page publique."
    : "Cet article est un brouillon : pas encore de page publique."

  return (
    // Client feedback, round 2: the preview column sits flush against the
    // page's right edge now (.admin-preview-layout), unlike the centred,
    // width-capped .admin-editor-layout the "index" screens (Articles,
    // Pages, Images) still use.
    <div className="admin-preview-layout">
      <form className="admin-editor" onSubmit={save}>
        {/*
          Client feedback: the title shown here was redundant with the
          Titre input (left) and the preview's own <h1> (right), so it's
          gone -- the freed line now carries the FR/EN toggle beside the
          publish control, the two controls that act on the whole article
          rather than one field of it.
        */}
        <div className="admin-toolbar">
          <div className="lang-toggle" role="group" aria-label="Langue du contenu">
            <button type="button" className={lang === 'fr' ? 'active' : ''} onClick={() => setLang('fr')}>Français</button>
            <button type="button" className={lang === 'en' ? 'active' : ''} onClick={() => setLang('en')}>English</button>
          </div>
          {/*
            Task 25, client feedback item 3: publish/unpublish only lived
            in the article list; the artist looked for it here too. Only
            shown for an already-saved article -- there's nothing to PATCH
            a status onto until the first save creates it.
          */}
          {id && (
            <span className="admin-status-control">
              <span className={`status-badge status-${article.status}`}>{STATUS_LABELS[article.status] || article.status}</span>
              <button type="button" onClick={togglePublish} disabled={statusBusy}>
                {article.status === 'published' ? 'Dépublier' : 'Publier'}
              </button>
            </span>
          )}
        </div>

        {error && <p role="alert" className="admin-error">{error}</p>}

        <LocalizedInput label="Titre" lang={lang} value={article.title} onChange={updateTitle} />
        {/*
          Task 27, Part B1: the migration added `subtitle` and it renders on
          the public page, but the editor never got an input for it. Plain
          text (LocalizedInput), never rich text: not sanitized
          server-side, same rule as Titre and Slug. Placed beside them, per
          the brief.

          Task 30 (client feedback): hidden for exhibitions -- verified
          against the real archive that all 25 left it empty, and all 39
          still do. Hidden, not deleted: the model/API keep the field, and
          `update()`/`save()` below are untouched, so a value that already
          exists here (or is typed while category briefly reads something
          else) is never blanked by hiding its input -- only the JSX is
          conditional. The year is a separate matter; see just below.
        */}
        {article.category !== 'exhibitions' && (
          <LocalizedInput label="Sous-titre" lang={lang} value={article.subtitle} onChange={(subtitle) => update({ subtitle })} />
        )}

        {/*
          ONE year field, whatever the category.
          
          A work used to be asked for its year three times over: "Année
          affichée" (the text printed beside the title, "2013-2014") and then
          the same year again as two numbers for sorting. They were never
          independent -- the migration derived the numbers from the label,
          and all 37 labelled articles still agree with theirs exactly -- so
          the second and third fields could only ever restate the first or
          contradict it. The label is asked for, the numbers are derived
          (yearRange.js).

          An exhibition has no printed year at all: its year is structural,
          the thing that orders the section and groups its dot under a label
          on the timeline. So it gets the number directly, and writes both
          ends of the range, since an exhibition happens in a year rather
          than over a span.
        */}
        {article.category === 'exhibitions' ? (
          <div className="year-field">
            <label htmlFor="yearStart">Année</label>
            <input
              id="yearStart"
              type="number"
              value={article.yearStart}
              onChange={(e) => update({ yearStart: e.target.value, yearEnd: e.target.value })}
            />
          </div>
        ) : (
          <LocalizedInput
            label="Année"
            lang={lang}
            value={article.yearLabel}
            onChange={(yearLabel) => update({ yearLabel, ...deriveSortYears(yearLabel) })}
          />
        )}

        <LocalizedInput
          label="Slug"
          lang={lang}
          value={article.slug}
          onChange={updateSlug}
          warning={
            <SlugWarnings
              slug={article.slug}
              onApply={(target, value) => updateSlug({ ...article.slug, [target]: value })}
            />
          }
        />

        <label htmlFor="category">Catégorie</label>
        <select id="category" value={article.category} onChange={(e) => update({ category: e.target.value })}>
          {Object.entries(CATEGORY_LABELS).map(([value, label]) => (
            <option key={value} value={value}>{label}</option>
          ))}
        </select>

        {/*
          Task 27, Part B3: the gallery (inside Contenu) is the substance of
          a work, so it sits directly after the header fields rather than
          further down the form. The separate cover picker is gone: a
          post-migration archive check (37 of 63 articles had a cover not
          among their gallery images, one had no gallery at all) showed the
          picker couldn't safely be dropped without it -- the client's
          answer was two per-item gallery toggles ("Cover", "Hidden from
          grid") instead, and a migration that folded every such cover into
          its own gallery as a hidden item first. Both toggles are wired via
          onSetCover/coverId below.
        */}
        <fieldset>
          <legend>Contenu</legend>
          <BlockEditor
            blocks={article.blocks}
            lang={lang}
            onChange={(blocks) => update({ blocks })}
            onSetCover={(cover) => update({ cover })}
            coverId={article.cover?._id || article.cover || null}
          />
        </fieldset>

        <div className="admin-editor-actions">
          <button type="submit" disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
          {/* Task 28, client feedback: a count of pending edits beside
              Enregistrer -- see unsavedChanges.js for exactly what counts
              as one. Not shown at all at 0, the same way {saved} below only
              shows right after a save; a 0 badge would just be noise. */}
          {unsavedCount > 0 && (
            <span className="unsaved-count">
              {unsavedCount} modification{unsavedCount > 1 ? 's' : ''} non enregistrée{unsavedCount > 1 ? 's' : ''}
            </span>
          )}
          {saved && <span className="save-confirmation">Enregistré</span>}
          {id && (
            <span className="admin-editor-delete">
              <ConfirmDelete label={article.title?.fr || 'cet article'} onConfirm={deleteArticle} busy={deleteBusy} />
            </span>
          )}
        </div>
      </form>

      <aside className="admin-preview-pane" aria-label="Aperçu">
        <div className="admin-preview-header">
          <h2>Aperçu</h2>
          {canLinkLive ? (
            <a className="admin-preview-live-link" href={liveUrl} target="_blank" rel="noopener">
              <ExternalLinkIcon />
              Voir la page publique
            </a>
          ) : (
            <span className="admin-preview-live-link is-disabled" title={noLiveLinkReason}>
              <ExternalLinkIcon />
              {noLiveLinkReason}
            </span>
          )}
        </div>
        <div className="admin-preview-scroll">
          <ArticlePreview article={article} lang={lang} />
        </div>
      </aside>
    </div>
  )
}
