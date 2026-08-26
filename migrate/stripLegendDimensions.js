/**
 * Removes the physical dimensions from every image legend that carries one.
 *
 * Dry run by default, like every other script in here. `--write` applies, and
 * always saves a backup of the exact before/after pairs first: this rewrites
 * the artist's own captions in the production database, and the originals are
 * not recoverable from anywhere else.
 *
 *   node migrate/stripLegendDimensions.js            # report only
 *   node migrate/stripLegendDimensions.js --write    # apply, after backing up
 */
import { writeFileSync } from 'node:fs'
import { MongoClient } from 'mongodb'
import { stripDimensions } from './stripDimensions.js'

const MONGO = process.env.MONGO_URI || 'mongodb://127.0.0.1:27019'
const write = process.argv.includes('--write')
const backupPath = `legend-dimensions-backup-${process.argv[2] || 'run'}.json`

const client = new MongoClient(MONGO)
await client.connect()
const images = client.db('philippe').collection('images')
const all = await images.find({}, { projection: { alt: 1 } }).toArray()

const edits = []
for (const image of all) {
  const before = image.alt?.fr || ''
  const after = stripDimensions(before)
  if (after && after !== before) edits.push({ _id: image._id, before, after })
}

console.log(`${all.length} images, ${edits.length} legends carry dimensions`)
edits.slice(0, 5).forEach((e) => console.log(`   ${e.before}\n-> ${e.after}\n`))

if (!write) {
  console.log('(dry run -- pass --write to apply)')
} else {
  writeFileSync(backupPath, JSON.stringify(edits, null, 2))
  console.log(`backup written to ${backupPath}`)
  for (const edit of edits) {
    await images.updateOne({ _id: edit._id }, { $set: { 'alt.fr': edit.after } })
  }
  console.log(`WRITTEN: ${edits.length} legends updated`)
}
await client.close()
