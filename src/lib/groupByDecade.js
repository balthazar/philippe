export function groupByDecade(articles = []) {
  const dated = articles.filter((a) => Number.isFinite(a.yearStart))
  const undated = articles.filter((a) => !Number.isFinite(a.yearStart))

  const byDecade = new Map()
  for (const a of dated) {
    const decade = Math.floor(a.yearStart / 10) * 10
    byDecade.set(decade, [...(byDecade.get(decade) || []), a])
  }

  const groups = [...byDecade.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([decade, items]) => ({
      decade,
      label: `${decade}`,
      items: items.sort((a, b) => b.yearStart - a.yearStart),
    }))

  if (undated.length) groups.push({ decade: null, label: '', items: undated })
  return groups
}
