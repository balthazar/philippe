import { createContext, useContext, useEffect, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { langFromPath, routeFor } from './routes.js'

const LangContext = createContext('fr')

export function LangProvider({ children }) {
  const { pathname } = useLocation()
  const lang = langFromPath(pathname)

  // index.html hardcodes lang="fr" and Task 22's prerender writes the correct
  // static value per route. This effect keeps <html lang> in step with the
  // route after hydration, for client-side navigation between languages.
  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  return <LangContext.Provider value={lang}>{children}</LangContext.Provider>
}

export function useLang() {
  const lang = useContext(LangContext)
  return useMemo(
    () => ({
      lang,
      otherLang: lang === 'fr' ? 'en' : 'fr',
      href: (key, slug) => routeFor(key, lang, slug),
    }),
    [lang]
  )
}
