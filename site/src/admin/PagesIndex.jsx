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
    // Same container ArticleEditor already uses for its single-column
    // wrapper (task 26): .admin-editor-layout is what owns the page's
    // horizontal padding, so .admin-editor and everything inside it -- the
    // toolbar's heading and the list below -- align to the same edge by
    // default, instead of each child needing its own matching pad.
    <div className="admin-editor-layout">
      <div className="admin-editor">
        <div className="admin-toolbar">
          <h1>Pages</h1>
        </div>

        <ul className="admin-pages-list">
          {Object.entries(PAGE_LABELS).map(([key, label]) => (
            <li key={key}>
              <Link to={`/admin/pages/${key}`}>{label}</Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
