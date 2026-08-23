import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'

const mediaSrc = (variant) => (variant?.path ? `/media/${variant.path}` : '')

export function ArticleCard({ article, routeKey = 'works' }) {
  const { href } = useLang()
  const { cover } = article
  return (
    <Link to={href(routeKey, article.slug)} className="card">
      <div className="card-frame">
        {cover?.variants?.thumb && (
          <img
            src={mediaSrc(cover.variants.thumb)}
            srcSet={[cover.variants.thumb, cover.variants.medium]
              .filter(Boolean)
              .map((v) => `${mediaSrc(v)} ${v.width}w`)
              .join(', ')}
            sizes="(max-width: 700px) 100vw, 33vw"
            width={cover.variants.thumb.width}
            height={cover.variants.thumb.height}
            alt={cover.alt || ''}
            loading="lazy"
          />
        )}
      </div>
      <span className="card-caption">
        {article.title}
        {article.yearLabel ? ` | ${article.yearLabel}` : ''}
      </span>
    </Link>
  )
}
