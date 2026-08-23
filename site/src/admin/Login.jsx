import { useState } from 'react'

// Admin is French-only, deliberately (Task 20 controller correction 5):
// there is one admin user, the artist, and he works in French. No
// useLang(), no language toggle here.
export function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await onLogin(email, password)
    } catch {
      setError('Identifiants invalides')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form className="admin-login" onSubmit={submit}>
      <h1>Administration</h1>
      <label htmlFor="email">Courriel</label>
      <input
        id="email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="username"
        required
      />
      <label htmlFor="password">Mot de passe</label>
      <input
        id="password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="current-password"
        required
      />
      {error && <p role="alert">{error}</p>}
      <button type="submit" disabled={submitting}>Connexion</button>
    </form>
  )
}
