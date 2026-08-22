import mongoose from 'mongoose'

export async function connect(uri = process.env.MONGO_URI, dbName = process.env.MONGO_DB || 'philippe') {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, { dbName })
  return mongoose.connection
}

export async function disconnect() {
  await mongoose.disconnect()
}
