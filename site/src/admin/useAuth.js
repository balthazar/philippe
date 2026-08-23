import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiSend } from '@/api.js'

/**
 * Session state lives only in React state, rehydrated on mount from
 * GET /auth/me. The JWT itself is an httpOnly cookie: it is never read,
 * stored, or copied here (no localStorage/sessionStorage), by design (Task
 * 20 controller correction 4).
 */
export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    apiGet('/auth/me')
      .then((me) => { if (!cancelled) setUser(me) })
      .catch(() => { if (!cancelled) setUser(null) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [])

  const login = useCallback(async (email, password) => {
    const me = await apiSend('POST', '/auth/login', { email, password })
    setUser(me)
    return me
  }, [])

  const logout = useCallback(async () => {
    await apiSend('POST', '/auth/logout')
    setUser(null)
  }, [])

  return { user, loading, login, logout }
}
