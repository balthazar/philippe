import { createContext, useContext } from 'react'

/**
 * Lets any admin page (ArticleList, and Task 21's editor/media/page
 * screens) signal "the session just expired" up to <Admin>, without each
 * page needing its own independent useAuth() (which would each re-fetch
 * GET /auth/me on their own). <Admin> provides the real handler
 * (useAuth().clearSession); the default no-op keeps a page renderable on
 * its own in tests that don't exercise session expiry.
 */
const SessionContext = createContext(() => {})

export const SessionExpiredProvider = SessionContext.Provider

export function useSessionExpired() {
  return useContext(SessionContext)
}
