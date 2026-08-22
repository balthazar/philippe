import { MongoMemoryServer } from 'mongodb-memory-server'
import mongoose from 'mongoose'

export function withDb() {
  let server
  return {
    async start() {
      server = await MongoMemoryServer.create()
      await mongoose.connect(server.getUri(), { dbName: 'test' })
      // Indexes are what the duplicate-slug test actually exercises.
      await Promise.all(Object.values(mongoose.models).map((m) => m.syncIndexes()))
    },
    async stop() {
      await mongoose.disconnect()
      await server.stop()
    },
  }
}
