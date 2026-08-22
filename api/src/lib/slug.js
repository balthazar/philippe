export function slugify(text) {
  return String(text || '')
    .replace(/Œ/g, 'OE').replace(/œ/g, 'oe')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function uniqueSlug(base, exists) {
  const root = slugify(base)
  if (!(await exists(root))) return root
  for (let n = 2; ; n += 1) {
    const candidate = `${root}-${n}`
    if (!(await exists(candidate))) return candidate
  }
}
