import { createContext, useContext, useMemo } from 'react'
import { useLocation } from 'react-router-dom'
import { langFromPath, routeFor } from './routes.js'

const LangContext = createContext('fr')

export function LangProvider({ children }) {
  const { pathname } = useLocation()
  const lang = langFromPath(pathname)
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
