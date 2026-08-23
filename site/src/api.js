const BASE = import.meta.env?.VITE_API_BASE || ''

export async function apiGet(path, params = {}) {
  const query = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== ''))
  const res = await fetch(`${BASE}/api${path}${query.toString() ? `?${query}` : ''}`, {
    credentials: 'include',
  })
  if (!res.ok) throw Object.assign(new Error('request failed'), { status: res.status })
  return res.json()
}

export async function apiSend(method, path, body) {
  const res = await fetch(`${BASE}/api${path}`, {
    method,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', 'X-Requested-With': 'philippe-admin' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
  if (!res.ok) throw Object.assign(new Error('request failed'), { status: res.status })
  return res.json()
}

export async function apiUpload(path, file) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE}/api${path}`, {
    method: 'POST',
    credentials: 'include',
    headers: { 'X-Requested-With': 'philippe-admin' },
    body: form,
  })
  if (!res.ok) throw Object.assign(new Error('upload failed'), { status: res.status })
  return res.json()
}
