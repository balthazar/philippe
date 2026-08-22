import { createApp } from './app.js'

export function startServer(port = Number(process.env.PORT || 8080)) {
  return createApp().listen(port, () => console.log(`api listening on ${port}`))
}

if (import.meta.url === `file://${process.argv[1]}`) startServer()
