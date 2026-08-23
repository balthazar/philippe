import { useCallback, useEffect, useState } from 'react'

const src = (v) => (v?.path ? `/media/${v.path}` : '')

export function Lightbox({ images = [], index = 0, onClose }) {
  const [current, setCurrent] = useState(index)
  const move = useCallback(
    (delta) => setCurrent((c) => (c + delta + images.length) % images.length),
    [images.length]
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, onClose])

  const image = images[current]
  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Fermer">×</button>
      <button type="button" className="lightbox-prev" onClick={() => move(-1)} aria-label="Précédent">‹</button>
      <img src={src(image?.variants?.large || image?.variants?.medium)} alt={image?.alt || ''} />
      <button type="button" className="lightbox-next" onClick={() => move(1)} aria-label="Suivant">›</button>
    </div>
  )
}
