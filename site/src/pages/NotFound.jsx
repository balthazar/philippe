import { Link } from 'react-router-dom'
import { useLang } from '@/lang.jsx'
import { Container } from '@/components/Container.jsx'

export function NotFound() {
  const { lang, href } = useLang()

  return (
    <Container as="main">
      <h1>404</h1>
      <p>{lang === 'fr' ? 'Page introuvable.' : 'Page not found.'}</p>
      <Link to={href('home')}>{lang === 'fr' ? "Retour à l'accueil" : 'Back home'}</Link>
    </Container>
  )
}
