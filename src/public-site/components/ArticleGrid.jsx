import { ArticleCard } from './ArticleCard.jsx'

export function ArticleGrid({ items, routeKey }) {
  return (
    <ul className="grid">
      {items.map((article) => (
        <li key={article._id || article.slug}>
          <ArticleCard article={article} routeKey={routeKey} />
        </li>
      ))}
    </ul>
  )
}
