import { createApp } from './app.js'
import { bootstrap } from './bootstrap.js'

export function startServer(port = Number(process.env.PORT || 8080)) {
  return createApp().listen(port, () => console.log(`api listening on ${port}`))
}

async function main() {
  await bootstrap()
  startServer()
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((err) => {
    console.error(err.message)
    process.exit(1)
  })
}
