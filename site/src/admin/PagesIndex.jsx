import { Link } from 'react-router-dom'
import { PAGE_LABELS } from './PageEditor.jsx'

/**
 * Task 25, section 6: the artist could previously only reach /admin/pages/
 * biography by typing the URL by hand; every other one of the eight pages
 * required knowing its key. This lists all eight, including `exhibitions`,
 * which has no document yet (the migration produced only seven pages) --
 * GET /admin/pages/:key already falls back to an empty page rather than
 * erroring, and PATCH upserts, so opening it here and saving simply creates it.
 */
export function PagesIndex() {
  return (
    <div className="admin-editor">
      <div className="admin-toolbar">
        <h1>Pages</h1>
        <Link to="/admin">Retour aux articles</Link>
      </div>

      <ul className="admin-pages-list">
        {Object.entries(PAGE_LABELS).map(([key, label]) => (
          <li key={key}>
            <Link to={`/admin/pages/${key}`}>{label}</Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
