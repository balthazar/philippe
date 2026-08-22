# Philippe Gronon Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace a WordPress site with a bilingual, block-based React/Node/MongoDB CMS, migrating 63 articles and roughly 1200 images, deployed to the `dadonew` k3s cluster.

**Architecture:** A Vite + React SPA (public site plus a lazy-loaded admin) talks to an Express + Mongoose JSON API. Articles are ordered typed blocks. Every text value is `{fr, en}` and resolves as `en || fr`. Images are content-hashed, processed by sharp into three webp variants on a PVC, and served by the API. A deploy-time prerender writes static HTML per route so crawlers see real content.

**Tech Stack:** Node 20 (ESM), Express 4, Mongoose 8, sharp, multer, bcryptjs, jsonwebtoken, sanitize-html, Vite 5, React 18, react-router-dom 6, TipTap, vitest, supertest, mongodb-memory-server, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-22-philippe-gronon-site-design.md`

## Global Constraints

Every task's requirements implicitly include this section. Values are copied verbatim from the spec.

- **Node 24 LTS**, ESM throughout (`"type": "module"` in both package.json files). Node 20's LTS window has ended, so it receives no further security updates; a new project must not be pinned to an unsupported runtime. Node 24 is the current LTS. Node 26 is Current rather than LTS and is not an appropriate pin for a deployed site. Both `package.json` files declare `"engines": { "node": ">=24" }`, `.nvmrc` pins `24.19.0`, and Docker images use `node:24.19-alpine`, a concrete tag rather than a floating major, so a rebuild cannot silently change the runtime underneath us. Node 24 also supports `require(ESM)` natively, which removes the `sanitize-html`/`htmlparser2` interop failure as a class of problem rather than working around it.
- **The API sets `app.set('trust proxy', 1)`.** It runs behind Traefik, which adds `X-Forwarded-For`. Verified behaviour of `express-rate-limit` 7.5.1: it raises `ERR_ERL_UNEXPECTED_X_FORWARDED_FOR` internally, logs it to stderr, and still serves the request, so the symptom is NOT a 500. The real consequence is that `req.ip` stays the proxy's address, so a per-IP limiter degrades into one global bucket and any unauthenticated caller can exhaust the login budget and lock the site's only admin out. One hop, because Traefik is the only proxy in front of the API.
- **`bootstrap()` runs before the server listens.** It validates `JWT_SECRET` first and throws if it is missing (jwt.sign throws synchronously on a falsy secret, inside an async handler Express 4 will not catch, which under Node 24 terminates the process at first login). It then connects to MongoDB and seeds the admin. Without it the API serves a healthy `/health` while holding no database connection at all.
- **Test evidence means the `Test Files` line and the exit code, not the test count.** Vitest prints a passing test count even when an entire file fails to load and contributes zero tests. A suite that fails to collect is a failure regardless of how many other tests passed.
- API listens on port **8080** and exposes **`/health`**.
- Categories are exactly: `works`, `exhibitions`, `editions`, `public-orders`.
- Page keys are exactly: `home`, `works`, `exhibitions`, `biography`, `contact`, `bibliography`, `links`, `legal`.
- A localized field is `{ fr: String, en: String }` and reads as `field[lang] || field.fr`. The `fr` base is never empty; where the WordPress source has no FR, the EN source populates it.
- Image variants: `thumb` 600w, `medium` 1400w, `large` 2400w, all webp, original preserved. Filenames are content hashes.
- Media root is `/data/media` (env `MEDIA_ROOT`), a 20Gi `local-path` PVC named `philippe-media`. The API runs `replicas: 1` with strategy `Recreate` because `local-path` is node-local and ReadWriteOnce.
- Auth is a 12-hour JWT in an httpOnly, Secure, SameSite=Lax cookie. Mutations additionally require the `X-Requested-With: philippe-admin` header.
- Sanitize whitelist for stored HTML: `p`, `br`, `em`, `strong`, `a[href]`, `ul`, `ol`, `li`, `dl`, `dt`, `dd`, `blockquote`. Theme classes and inline styles are stripped.
- Deploy target: namespace `apps`, `imagePullSecrets: ghcr-creds`, images `ghcr.io/goobernetics/philippe-api` and `ghcr.io/goobernetics/philippe-web`, host `philippe.natazar.org`, Traefik ingress class, MongoDB at `mongo.infra.svc.cluster.local:27017`, database `philippe`.
- Migration targets, asserted by `verify.js`: **63 articles** (62 FR/EN pairs plus 1 EN-only), **7 pages**, and every article having a cover and at least one block.
- Secrets are never committed. `MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` come from a k8s Secret created out of band.
- **Any task that adds a dependency MUST stage `package.json` AND `package-lock.json` in the same commit as the code that imports it.** A commit that imports a package it did not declare does not build from a clean checkout and breaks `npm ci` in CI, even though it passes locally where `node_modules` is already populated.
- **Image sizing is exactly two settings, no more.** (1) The gallery grid: `columns` on each gallery block, 1 to 6, and `span` on each item, 1 to 6, being how many of those columns that image occupies. A span is clamped to the block's column count at render time, so an editor cannot produce a broken grid by lowering `columns` after setting a wide span. (2) `featured` ("en avant") on each article: a single toggle that both puts the work in the homepage slideshow and gives it a double-width card in the works list. There is no separately curated slideshow list and no per-card size field; one toggle drives both so they cannot drift apart.
- Regexes must never contain literal combining or invisible Unicode characters. Write them as ASCII escape sequences so the source stays reviewable and diff-safe.

---

## File Structure

**API** (`api/src/`), each file one responsibility:

| File | Responsible for |
|---|---|
| `server.js` | Process entry: awaits `bootstrap()`, then listens |
| `bootstrap.js` | Config validation, database connection, admin seeding |
| `db.js` | Mongoose connection and admin seeding |
| `lib/localize.js` | Localized field schema and `localize`/`resolveDoc` readers |
| `lib/slug.js` | `slugify`, uniqueness suffixing |
| `lib/sanitize.js` | The HTML whitelist, one exported `sanitize()` |
| `lib/imagePipeline.js` | sharp variants, content hashing, disk writes |
| `models/{Article,Page,Image,User,Home}.js` | Schemas and indexes only, no request logic |
| `routes/public.js` | Read-only endpoints, language-resolved output |
| `routes/auth.js` | Login, logout, me, password change |
| `routes/admin.js` | CRUD, raw localized output |
| `routes/media.js` | Static file serving with cache headers |
| `middleware/{auth,upload,errors}.js` | `requireAuth`, `requireCsrfHeader`, multer config, error shape |

**Migration** (`migrate/`): `db.js` (MariaDB access), `extract.js`, `elementor.js`, `load.js`, `verify.js`. `elementor.js` is pure (JSON in, blocks out) so it is testable without a database.

**Web** (`src/`): `lib/` (api client, `LangProvider`, routes), `public-site/` (pages and components), `admin/` (lazy-loaded), `design/` (tokens and layout primitives). `prerender/` sits outside `src/` because it runs in Node after the build.

---

## Phase 1: Foundations

### Task 1: Repo scaffold, API skeleton, test harness

**Files:**
- Create: `api/package.json`, `api/src/server.js`, `api/src/app.js`, `api/vitest.config.js`
- Create: `api/test/health.test.js`
- Create: `docker-compose.dev.yml`, `.nvmrc`

**Interfaces:**
- Consumes: nothing.
- Produces: `createApp()` from `api/src/app.js` returning an Express app without starting a listener, so tests can mount it with supertest. `startServer()` from `server.js`.

- [ ] **Step 1: Write the failing test**

```js
// api/test/health.test.js
import { describe, it, expect } from 'vitest'
import request from 'supertest'
import { createApp } from '../src/app.js'

describe('GET /health', () => {
  it('returns ok', async () => {
    const res = await request(createApp()).get('/health')
    expect(res.status).toBe(200)
    expect(res.body).toEqual({ status: 'ok' })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- health`
Expected: FAIL, cannot resolve `../src/app.js`.

- [ ] **Step 3: Write the minimal implementation**

```json
// api/package.json
{
  "name": "philippe-api",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "node --watch src/server.js",
    "start": "node src/server.js",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "express": "^4.19.2",
    "mongoose": "^8.6.0",
    "helmet": "^7.1.0",
    "cookie-parser": "^1.4.6",
    "cors": "^2.8.5"
  },
  "devDependencies": {
    "vitest": "^2.0.5",
    "supertest": "^7.0.0",
    "mongodb-memory-server": "^10.0.0"
  }
}
```

```js
// api/src/app.js
import express from 'express'
import helmet from 'helmet'
import cookieParser from 'cookie-parser'

export function createApp() {
  const app = express()
  app.use(helmet())
  app.use(express.json({ limit: '1mb' }))
  app.use(cookieParser())
  app.get('/health', (req, res) => res.json({ status: 'ok' }))
  return app
}
```

```js
// api/src/server.js
import { createApp } from './app.js'

const port = Number(process.env.PORT || 8080)
createApp().listen(port, () => console.log(`api listening on ${port}`))
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm install && npm test`
Expected: PASS, 1 test.

- [ ] **Step 5: Add the local development stack**

```yaml
# docker-compose.dev.yml
services:
  mongo:
    image: mongo:7
    ports: ['27018:27017']
    volumes: ['./.dev/mongo:/data/db']
  mariadb:
    image: mariadb:10.11
    environment:
      MARIADB_ROOT_PASSWORD: root
      MARIADB_DATABASE: wp
    ports: ['3399:3306']
    volumes: ['./.dev/mariadb:/var/lib/mysql']
```

Note: a `pg-wp` container with the WordPress dump already imported may still be
running from the design phase. `docker ps | grep pg-wp` to check. Phase 3 can
reuse it instead of re-importing.

- [ ] **Step 6: Commit**

```bash
git add api docker-compose.dev.yml .nvmrc
git commit -m "feat(api): scaffold express app with health endpoint"
```

---

### Task 2: Localized field helper

This is the single most reused piece of the system. Every model embeds it and every read path calls it.

**Files:**
- Create: `api/src/lib/localize.js`
- Test: `api/test/lib/localize.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `localizedField()` returning a Mongoose schema fragment `{ fr: String, en: String }`.
  - `localize(field, lang)` returning a string.
  - `resolveDoc(value, lang)` deep-resolving every localized object inside a plain object or array.
  - `isLocalized(value)` predicate.

- [ ] **Step 1: Write the failing test**

```js
// api/test/lib/localize.test.js
import { describe, it, expect } from 'vitest'
import mongoose from 'mongoose'
import { localize, resolveDoc } from '../../src/lib/localize.js'

describe('localize', () => {
  it('returns the requested language when present', () => {
    expect(localize({ fr: 'Bonjour', en: 'Hello' }, 'en')).toBe('Hello')
  })

  it('falls back to French when the English override is empty', () => {
    expect(localize({ fr: 'Châssis-Presse', en: '' }, 'en')).toBe('Châssis-Presse')
    expect(localize({ fr: 'Châssis-Presse' }, 'en')).toBe('Châssis-Presse')
  })

  it('returns an empty string for a missing field', () => {
    expect(localize(undefined, 'fr')).toBe('')
  })
})

describe('resolveDoc', () => {
  it('resolves localized values nested in arrays and objects', () => {
    const doc = {
      title: { fr: 'Œuvres', en: 'Works' },
      blocks: [{ type: 'text', value: { fr: 'Texte', en: '' } }],
      year: 2021,
    }
    expect(resolveDoc(doc, 'en')).toEqual({
      title: 'Works',
      blocks: [{ type: 'text', value: 'Texte' }],
      year: 2021,
    })
  })

  it('leaves non-localized objects alone', () => {
    expect(resolveDoc({ size: { w: 10, h: 20 } }, 'fr')).toEqual({ size: { w: 10, h: 20 } })
  })

  // Tasks 7 and 8 pass .lean() documents through this on every read path.
  it('passes ObjectId, Date and null through untouched', () => {
    const id = new mongoose.Types.ObjectId()
    const when = new Date('2021-03-04T00:00:00Z')
    const out = resolveDoc({ _id: id, createdAt: when, cover: null }, 'en')
    expect(out._id).toBeInstanceOf(mongoose.Types.ObjectId)
    expect(String(out._id)).toBe(String(id))
    expect(out.createdAt).toBeInstanceOf(Date)
    expect(out.cover).toBeNull()
  })

  it('resolves a realistic document without damaging its references', () => {
    const id = new mongoose.Types.ObjectId()
    const cover = new mongoose.Types.ObjectId()
    const out = resolveDoc(
      { _id: id, title: { fr: 'Porte', en: '' }, cover, createdAt: new Date() },
      'en'
    )
    expect(out.title).toBe('Porte')
    expect(String(out._id)).toBe(String(id))
    expect(String(out.cover)).toBe(String(cover))
    expect(out.createdAt).toBeInstanceOf(Date)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- localize`
Expected: FAIL, cannot resolve `localize.js`.

- [ ] **Step 3: Write the minimal implementation**

```js
// api/src/lib/localize.js

/** A localized value is exactly {fr, en}. `fr` is the base and is never empty. */
export function localizedField() {
  return { fr: { type: String, default: '' }, en: { type: String, default: '' } }
}

export function isLocalized(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const keys = Object.keys(value)
  return keys.length > 0 && keys.every((k) => k === 'fr' || k === 'en')
}

export function localize(field, lang) {
  if (!field) return ''
  return field[lang] || field.fr || ''
}

/**
 * Only PLAIN objects are recursed into. Blacklisting Date is not enough: a
 * Mongoose ObjectId is also an object, and recursing into one turns every _id
 * in every API response into a meaningless buffer object. One prototype check
 * excludes ObjectId, Date, Buffer and every other class instance at once, and
 * keeps this module free of a mongoose import.
 */
function isPlainObject(value) {
  if (!value || typeof value !== 'object') return false
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

export function resolveDoc(value, lang) {
  if (Array.isArray(value)) return value.map((v) => resolveDoc(v, lang))
  if (isLocalized(value)) return localize(value, lang)
  if (isPlainObject(value)) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveDoc(v, lang)]))
  }
  return value
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- localize`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/lib/localize.js api/test/lib/localize.test.js
git commit -m "feat(api): add localized field helper with French fallback"
```

---

### Task 3: Models and database connection

**Files:**
- Create: `api/src/models/{Image,Article,Page,Home,User}.js`, `api/src/db.js`, `api/src/lib/constants.js`
- Test: `api/test/models/article.test.js`, `api/test/helpers/db.js`

**Interfaces:**
- Consumes: `localizedField` from Task 2.
- Produces: Mongoose models `Image`, `Article`, `Page`, `Home`, `User`; `connect(uri, dbName)` and `disconnect()` from `db.js`; `CATEGORIES` and `PAGE_KEYS` arrays from `constants.js`; a test helper `withDb()` starting `mongodb-memory-server`.

- [ ] **Step 1: Write the failing test**

```js
// api/test/models/article.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withDb } from '../helpers/db.js'
import { Article } from '../../src/models/Article.js'

const db = withDb()
beforeAll(db.start)
afterAll(db.stop)

describe('Article', () => {
  it('rejects an unknown category', async () => {
    const a = new Article({ category: 'sculpture', slug: { fr: 'x' }, title: { fr: 'X' } })
    await expect(a.validate()).rejects.toThrow(/category/)
  })

  it('rejects a duplicate French slug', async () => {
    await Article.create({ category: 'works', slug: { fr: 'dupe' }, title: { fr: 'A' } })
    await expect(
      Article.create({ category: 'works', slug: { fr: 'dupe' }, title: { fr: 'B' } })
    ).rejects.toThrow(/duplicate key/)
  })

  it('defaults to draft status', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'd1' }, title: { fr: 'A' } })
    expect(a.status).toBe('draft')
  })

  it('accepts the five block types', async () => {
    const a = await Article.create({
      category: 'works',
      slug: { fr: 'blocks' },
      title: { fr: 'A' },
      blocks: [
        { type: 'text', value: { fr: '<p>Bonjour</p>' } },
        { type: 'heading', value: { fr: 'Titre' }, level: 2 },
        { type: 'specs', items: [{ term: { fr: 'Tirage' }, value: { fr: '3' } }] },
      ],
    })
    expect(a.blocks).toHaveLength(3)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- article`
Expected: FAIL, cannot resolve `Article.js`.

- [ ] **Step 3: Write the minimal implementation**

```js
// api/src/lib/constants.js
export const CATEGORIES = ['works', 'exhibitions', 'editions', 'public-orders']
export const PAGE_KEYS = ['home', 'works', 'exhibitions', 'biography', 'contact', 'bibliography', 'links', 'legal']
export const BLOCK_TYPES = ['text', 'heading', 'image', 'gallery', 'specs']
```

```js
// api/src/models/Article.js
import mongoose from 'mongoose'
import { localizedField } from '../lib/localize.js'
import { CATEGORIES, BLOCK_TYPES } from '../lib/constants.js'

const blockSchema = new mongoose.Schema(
  {
    type: { type: String, enum: BLOCK_TYPES, required: true },
    value: localizedField(),                                   // text, heading
    level: { type: Number, enum: [2, 3], default: 2 },         // heading
    image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' }, // image
    caption: localizedField(),                                 // image
    size: { type: String, enum: ['full', 'wide', 'inset'], default: 'wide' },
    items: [
      new mongoose.Schema(
        {
          image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' }, // gallery
          caption: localizedField(),
          term: localizedField(),                              // specs
          value: localizedField(),
        },
        { _id: false }
      ),
    ],
    columns: { type: Number, enum: [2, 3, 4], default: 3 },
  },
  { _id: false }
)

const articleSchema = new mongoose.Schema(
  {
    slug: localizedField(),
    category: { type: String, enum: CATEGORIES, required: true },
    title: localizedField(),
    yearLabel: localizedField(),
    yearStart: Number,
    yearEnd: Number,
    cover: { type: mongoose.Schema.Types.ObjectId, ref: 'Image' },
    blocks: [blockSchema],
    status: { type: String, enum: ['draft', 'published'], default: 'draft' },
    position: { type: Number, default: 0 },
    seoDescription: localizedField(),
    legacyWpId: Number,
  },
  { timestamps: true }
)

// A sparse index skips only missing/null values, but localizedField() defaults
// both languages to '', so every article without an English slug would collide
// with every other one. Partial indexes on non-empty strings are what we want.
articleSchema.index({ 'slug.fr': 1 }, { unique: true, partialFilterExpression: { 'slug.fr': { $gt: '' } } })
articleSchema.index({ 'slug.en': 1 }, { unique: true, partialFilterExpression: { 'slug.en': { $gt: '' } } })
articleSchema.index({ category: 1, status: 1, yearStart: -1 })
articleSchema.index({ legacyWpId: 1 }, { unique: true, sparse: true })

// Exported so Page can reuse the same block shape without reaching into
// Article's schema internals. Sharing a sub-schema across models is supported.
export { blockSchema }
export const Article = mongoose.model('Article', articleSchema)
```

```js
// api/src/models/Image.js
import mongoose from 'mongoose'
import { localizedField } from '../lib/localize.js'

const variantSchema = new mongoose.Schema(
  { path: String, width: Number, height: Number, bytes: Number },
  { _id: false }
)

const imageSchema = new mongoose.Schema(
  {
    filename: { type: String, required: true, unique: true },
    originalName: String,
    mime: String,
    width: Number,
    height: Number,
    bytes: Number,
    alt: localizedField(),
    variants: {
      thumb: variantSchema,
      medium: variantSchema,
      large: variantSchema,
      original: variantSchema,
    },
    legacyWpId: Number,
    legacyUrl: String,
  },
  { timestamps: true }
)

imageSchema.index({ legacyWpId: 1 }, { unique: true, sparse: true })

export const Image = mongoose.model('Image', imageSchema)
```

```js
// api/src/models/Page.js
import mongoose from 'mongoose'
import { localizedField } from '../lib/localize.js'
import { PAGE_KEYS } from '../lib/constants.js'
import { blockSchema } from './Article.js'

const pageSchema = new mongoose.Schema(
  {
    key: { type: String, enum: PAGE_KEYS, required: true, unique: true },
    title: localizedField(),
    blocks: { type: [blockSchema], default: [] },
    seoDescription: localizedField(),
  },
  { timestamps: true }
)

export const Page = mongoose.model('Page', pageSchema)
```

```js
// api/src/models/Home.js
import mongoose from 'mongoose'
import { localizedField } from '../lib/localize.js'

const homeSchema = new mongoose.Schema(
  {
    singleton: { type: String, default: 'home', unique: true },
    slides: [
      new mongoose.Schema(
        {
          image: { type: mongoose.Schema.Types.ObjectId, ref: 'Image', required: true },
          article: { type: mongoose.Schema.Types.ObjectId, ref: 'Article', default: null },
          caption: localizedField(),
        },
        { _id: false }
      ),
    ],
  },
  { timestamps: true }
)

export const Home = mongoose.model('Home', homeSchema)
```

```js
// api/src/models/User.js
import mongoose from 'mongoose'

const userSchema = new mongoose.Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
  },
  { timestamps: true }
)

export const User = mongoose.model('User', userSchema)
```

```js
// api/src/db.js
import mongoose from 'mongoose'

export async function connect(uri = process.env.MONGO_URI, dbName = process.env.MONGO_DB || 'philippe') {
  mongoose.set('strictQuery', true)
  await mongoose.connect(uri, { dbName })
  return mongoose.connection
}

export async function disconnect() {
  await mongoose.disconnect()
}
```

```js
// api/test/helpers/db.js
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- article`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/models api/src/db.js api/src/lib/constants.js api/test
git commit -m "feat(api): add content models with localized fields and indexes"
```

---

### Task 4: HTML sanitizing and slugs

**Files:**
- Create: `api/src/lib/sanitize.js`, `api/src/lib/slug.js`
- Test: `api/test/lib/sanitize.test.js`, `api/test/lib/slug.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces: `sanitize(html)` and `slugify(text)`, plus `uniqueSlug(base, exists)` where `exists` is an async predicate.

- [ ] **Step 1: Write the failing test**

```js
// api/test/lib/sanitize.test.js
import { describe, it, expect } from 'vitest'
import { sanitize } from '../../src/lib/sanitize.js'

describe('sanitize', () => {
  it('keeps the whitelisted structural tags', () => {
    const html = '<dl><dt>Tirage</dt><dd>3</dd></dl><p>Texte <em>oblique</em></p>'
    expect(sanitize(html)).toBe(html)
  })

  it('strips scripts, theme classes and inline styles', () => {
    expect(sanitize('<p class="elementor-x" style="color:red">Hi</p>')).toBe('<p>Hi</p>')
    expect(sanitize('<script>alert(1)</script><p>Hi</p>')).toBe('<p>Hi</p>')
  })

  it('keeps link hrefs but drops javascript: URLs', () => {
    expect(sanitize('<a href="https://x.com">x</a>')).toBe('<a href="https://x.com">x</a>')
    expect(sanitize('<a href="javascript:alert(1)">x</a>')).toBe('<a>x</a>')
  })
})
```

```js
// api/test/lib/slug.test.js
import { describe, it, expect } from 'vitest'
import { slugify, uniqueSlug } from '../../src/lib/slug.js'

describe('slugify', () => {
  it('lowercases and strips accents', () => {
    expect(slugify('Châssis-Presse')).toBe('chassis-presse')
    expect(slugify('Œuvres récentes')).toBe('oeuvres-recentes')
  })

  it('collapses punctuation and spaces into single hyphens', () => {
    expect(slugify('Nouveau | 2024')).toBe('nouveau-2024')
  })
})

describe('uniqueSlug', () => {
  it('appends a counter until the slug is free', async () => {
    const taken = new Set(['essai', 'essai-2'])
    expect(await uniqueSlug('Essai', async (s) => taken.has(s))).toBe('essai-3')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd api && npm test -- lib/`
Expected: FAIL, cannot resolve `sanitize.js` and `slug.js`.

- [ ] **Step 3: Write the minimal implementation**

Add `sanitize-html` to `api/package.json` dependencies (`^2.13.0`), then:

```js
// api/src/lib/sanitize.js
import sanitizeHtml from 'sanitize-html'

// The whitelist is deliberately narrow: everything the source content uses and
// nothing else. `dl`/`dt`/`dd` carry provenance data and must survive.
const OPTIONS = {
  allowedTags: ['p', 'br', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
}

export function sanitize(html) {
  if (!html) return ''
  return sanitizeHtml(html, OPTIONS)
}
```

```js
// api/src/lib/slug.js
export function slugify(text) {
  return String(text || '')
    .normalize('NFD')
    .replace(/Œ/g, 'OE').replace(/œ/g, 'oe')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function uniqueSlug(base, exists) {
  const root = slugify(base)
  if (!(await exists(root))) return root
  for (let n = 2; ; n += 1) {
    const candidate = `${root}-${n}`
    if (!(await exists(candidate))) return candidate
  }
}
```

Note: `Œ` must be replaced before `normalize('NFD')` strips diacritics, because
NFD does not decompose the ligature. The `\u0300-\u036f` range is the combining
diacritical marks block, written as escapes rather than as the literal characters:
literal combining marks are invisible in an editor and are silently mangled by
copy/paste and reformatting.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd api && npm test -- lib/`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add api/package.json api/package-lock.json api/src/lib/sanitize.js api/src/lib/slug.js api/test/lib
git commit -m "feat(api): add HTML sanitizing and slug helpers"
```

---

### Task 5: Image pipeline

**Files:**
- Create: `api/src/lib/imagePipeline.js`
- Test: `api/test/lib/imagePipeline.test.js`, `api/test/fixtures/sample.jpg`

**Interfaces:**
- Consumes: nothing.
- Produces: `processImage(buffer, { originalName, mediaRoot })` resolving to `{ filename, originalName, mime, width, height, bytes, variants }`, matching the `Image` schema exactly. `mediaPath(mediaRoot, filename)` for reads.

- [ ] **Step 1: Write the failing test**

```js
// api/test/lib/imagePipeline.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { mkdtemp, rm, readFile, stat } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import sharp from 'sharp'
import { processImage } from '../../src/lib/imagePipeline.js'

let root
beforeAll(async () => { root = await mkdtemp(join(tmpdir(), 'media-')) })
afterAll(async () => { await rm(root, { recursive: true, force: true }) })

async function jpeg(width, height) {
  return sharp({ create: { width, height, channels: 3, background: '#888' } }).jpeg().toBuffer()
}

describe('processImage', () => {
  it('writes three webp variants plus the original', async () => {
    const result = await processImage(await jpeg(3000, 2000), { originalName: 'Porte.jpg', mediaRoot: root })
    expect(result.width).toBe(3000)
    expect(Object.keys(result.variants).sort()).toEqual(['large', 'medium', 'original', 'thumb'])
    for (const v of Object.values(result.variants)) {
      await expect(stat(join(root, v.path))).resolves.toBeTruthy()
    }
    expect(result.variants.thumb.width).toBe(600)
    expect(result.variants.medium.width).toBe(1400)
    expect(result.variants.large.width).toBe(2400)
  })

  it('never upscales a small source', async () => {
    const result = await processImage(await jpeg(400, 300), { originalName: 's.jpg', mediaRoot: root })
    expect(result.variants.thumb.width).toBe(400)
    expect(result.variants.large.width).toBe(400)
  })

  it('is content addressed, so identical bytes reuse the filename', async () => {
    const buf = await jpeg(800, 600)
    const a = await processImage(buf, { originalName: 'a.jpg', mediaRoot: root })
    const b = await processImage(buf, { originalName: 'b.jpg', mediaRoot: root })
    expect(a.filename).toBe(b.filename)
  })

  it('rejects a non-image buffer', async () => {
    await expect(
      processImage(Buffer.from('not an image'), { originalName: 'x.jpg', mediaRoot: root })
    ).rejects.toThrow(/unsupported image/i)
  })

  it('gives a TIFF original a .tif extension and keeps it TIFF', async () => {
    const tiff = await sharp({ create: { width: 500, height: 400, channels: 3, background: '#111' } }).tiff().toBuffer()
    const result = await processImage(tiff, { originalName: 'scan.tif', mediaRoot: root })
    expect(result.variants.original.path).toMatch(/\.tif$/)
    const written = await readFile(join(root, result.variants.original.path))
    expect((await sharp(written).metadata()).format).toBe('tiff')
  })

  it('keeps the original out of the served tree and the variants in it', async () => {
    const result = await processImage(await jpeg(900, 600), { originalName: 'o.jpg', mediaRoot: root })
    expect(result.variants.original.path.startsWith('_originals/')).toBe(true)
    for (const name of ['thumb', 'medium', 'large']) {
      expect(result.variants[name].path.startsWith('_originals/')).toBe(false)
    }
  })

  it('returns identical, clock-independent paths for identical bytes', async () => {
    const buf = await jpeg(1000, 800)
    const a = await processImage(buf, { originalName: 'a.jpg', mediaRoot: root })
    const b = await processImage(buf, { originalName: 'b.jpg', mediaRoot: root })
    expect(b.variants).toEqual(a.variants)
    // A year in the path would mean a re-run in January writes somewhere else.
    expect(JSON.stringify(a.variants)).not.toMatch(/\b(19|20)\d{2}\//)
  })

  it('reports display dimensions, not raw ones, for an EXIF-rotated source', async () => {
    const rotated = await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#444' } })
      .withMetadata({ orientation: 6 })   // 90 degrees: display is 800x1200
      .jpeg()
      .toBuffer()
    const result = await processImage(rotated, { originalName: 'r.jpg', mediaRoot: root })
    expect(result.width).toBe(800)
    expect(result.height).toBe(1200)
    // The variants are auto-oriented, so the aspect ratios must agree.
    expect(result.variants.large.width / result.variants.large.height)
      .toBeCloseTo(result.width / result.height, 2)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- imagePipeline`
Expected: FAIL, cannot resolve `imagePipeline.js`.

- [ ] **Step 3: Write the minimal implementation**

Add `sharp` (`^0.33.4`) to `api/package.json` dependencies, then:

```js
// api/src/lib/imagePipeline.js
import { createHash } from 'node:crypto'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, dirname } from 'node:path'
import sharp from 'sharp'

const VARIANTS = { thumb: 600, medium: 1400, large: 2400 }

// sharp's format name is not always the file extension.
const EXT = { jpeg: 'jpg', png: 'png', webp: 'webp', tiff: 'tif', gif: 'gif', avif: 'avif' }

// Originals live under this prefix. Task 9's media route refuses to serve
// anything beneath it, so the master is kept but never reachable over HTTP.
export const ORIGINALS_PREFIX = '_originals'

export function mediaPath(mediaRoot, relPath) {
  return join(mediaRoot, relPath)
}

/**
 * The three derived variants are re-encoded through sharp, which strips EXIF
 * and neutralizes payloads hidden in files claiming to be images. Those are the
 * only files ever served.
 *
 * The original is kept byte-exact as an archival master: it is NOT re-encoded,
 * so it retains its own metadata, and it is written under ORIGINALS_PREFIX
 * where the media route will not serve it.
 *
 * Every path is a pure function of the content hash, so re-running the
 * migration writes the same bytes to the same place. Never derive a path from
 * the clock.
 */
export async function processImage(buffer, { originalName, mediaRoot }) {
  let meta
  try {
    meta = await sharp(buffer).metadata()
  } catch {
    throw new Error('unsupported image format')
  }
  if (!meta.width || !meta.height) throw new Error('unsupported image format')

  // metadata() reports pre-rotation dimensions while every variant is produced
  // with .rotate(), so orientations 5-8 must be swapped or the top-level
  // dimensions disagree with the variants and aspect-ratio boxes render wrong.
  const swapped = meta.orientation >= 5 && meta.orientation <= 8
  const width = swapped ? meta.height : meta.width
  const height = swapped ? meta.width : meta.height

  const hash = createHash('sha256').update(buffer).digest('hex').slice(0, 16)
  const shard = hash.slice(0, 2)
  const variants = {}

  const originalRel = join(ORIGINALS_PREFIX, shard, `${hash}-original.${EXT[meta.format] || meta.format}`)
  await write(mediaRoot, originalRel, buffer)
  variants.original = { path: originalRel, width, height, bytes: buffer.length }

  for (const [name, targetWidth] of Object.entries(VARIANTS)) {
    const out = await sharp(buffer)
      .rotate()
      .resize({ width: Math.min(targetWidth, width), withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer()
    const info = await sharp(out).metadata()
    const rel = join(shard, `${hash}-${name}.webp`)
    await write(mediaRoot, rel, out)
    variants[name] = { path: rel, width: info.width, height: info.height, bytes: out.length }
  }

  return {
    filename: hash,
    originalName,
    mime: `image/${meta.format}`,
    width,
    height,
    bytes: buffer.length,
    variants,
  }
}

async function write(root, rel, buf) {
  const abs = join(root, rel)
  await mkdir(dirname(abs), { recursive: true })
  await writeFile(abs, buf)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- imagePipeline`
Expected: PASS, 4 tests.

- [ ] **Step 5: Commit**

```bash
git add api/package.json api/package-lock.json api/src/lib/imagePipeline.js api/test/lib/imagePipeline.test.js
git commit -m "feat(api): add sharp image pipeline with content-addressed variants"
```

---

### Task 5A: Image sizing fields

Two settings, added to the schemas Task 3 created. Everything downstream reads
them; nothing else stores sizing. Task 3 shipped `columns` as an enum of 2, 3 or
4; this task widens it to a 1-to-6 range so the editor controls the gallery's
column count directly.

**Files:**
- Modify: `api/src/models/Article.js`
- Test: `api/test/models/sizing.test.js`

**Interfaces:**
- Consumes: `Article`, `blockSchema` (Task 3).
- Produces: `featured` on Article, `span` on gallery items. Task 7 filters the
  slideshow on `featured`; Tasks 16, 17 and 18 render both; Task 21 edits both.

- [ ] **Step 1: Write the failing test**

```js
// api/test/models/sizing.test.js
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { withDb } from '../helpers/db.js'
import { Article } from '../../src/models/Article.js'

const db = withDb()
beforeAll(db.start)
afterAll(db.stop)

describe('featured', () => {
  it('defaults to false', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'f1' }, title: { fr: 'A' } })
    expect(a.featured).toBe(false)
  })

  it('is settable and queryable', async () => {
    await Article.create({ category: 'works', slug: { fr: 'f2' }, title: { fr: 'B' }, featured: true })
    const found = await Article.find({ featured: true })
    expect(found.map((a) => a.slug.fr)).toEqual(['f2'])
  })
})

describe('gallery columns', () => {
  it('defaults to three', async () => {
    const a = await Article.create({
      category: 'works', slug: { fr: 'c1' }, title: { fr: 'C' },
      blocks: [{ type: 'gallery', items: [] }],
    })
    expect(a.blocks[0].columns).toBe(3)
  })

  it('accepts any count from one to six', async () => {
    for (const columns of [1, 2, 3, 4, 5, 6]) {
      const a = await Article.create({
        category: 'works', slug: { fr: `c-${columns}` }, title: { fr: 'C' },
        blocks: [{ type: 'gallery', columns, items: [] }],
      })
      expect(a.blocks[0].columns).toBe(columns)
    }
  })

  it('rejects a count outside one to six', async () => {
    const a = new Article({
      category: 'works', slug: { fr: 'c9' }, title: { fr: 'C' },
      blocks: [{ type: 'gallery', columns: 7, items: [] }],
    })
    await expect(a.validate()).rejects.toThrow(/columns/)
  })
})

describe('gallery item span', () => {
  it('defaults to one column', async () => {
    const a = await Article.create({
      category: 'works', slug: { fr: 's1' }, title: { fr: 'C' },
      blocks: [{ type: 'gallery', columns: 3, items: [{ caption: { fr: '' } }] }],
    })
    expect(a.blocks[0].items[0].span).toBe(1)
  })

  it('accepts a span wider than two', async () => {
    const a = await Article.create({
      category: 'works', slug: { fr: 's2' }, title: { fr: 'D' },
      blocks: [{ type: 'gallery', columns: 6, items: [{ span: 4, caption: { fr: '' } }] }],
    })
    expect(a.blocks[0].items[0].span).toBe(4)
  })

  it('rejects a span outside one to six', async () => {
    const a = new Article({
      category: 'works', slug: { fr: 's3' }, title: { fr: 'E' },
      blocks: [{ type: 'gallery', items: [{ span: 7 }] }],
    })
    await expect(a.validate()).rejects.toThrow(/span/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- sizing`
Expected: FAIL, `featured` is undefined and `span` is not a schema path.

- [ ] **Step 3: Write the minimal implementation**

In `api/src/models/Article.js`, add `span` to the block items sub-schema:

```js
          span: { type: Number, min: 1, max: 6, default: 1 },      // gallery item width
```

and widen the existing `columns` field on the same sub-schema from its enum to a
range, so the editor picks the gallery's column count:

```js
    columns: { type: Number, min: 1, max: 6, default: 3 },
```

and add `featured` to the article schema, next to `position`:

```js
    // "en avant": one toggle, two effects. The work joins the homepage
    // slideshow and takes a double-width card in the works list.
    featured: { type: Boolean, default: false },
```

and an index supporting the slideshow query:

```js
articleSchema.index({ featured: 1, status: 1, position: 1 })
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- sizing`
Expected: PASS, 8 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/models/Article.js api/test/models/sizing.test.js
git commit -m "feat(api): add featured flag and gallery column/span sizing"
```

---

## Phase 2: API

### Task 6: Authentication

**Files:**
- Create: `api/src/routes/auth.js`, `api/src/middleware/auth.js`, `api/src/lib/seedAdmin.js`, `api/src/bootstrap.js`
- Modify: `api/src/app.js` (mount the router, trust the proxy), `api/src/server.js` (await bootstrap)
- Test: `api/test/routes/auth.test.js`, `api/test/bootstrap.test.js`

**Interfaces:**
- Consumes: `User` (Task 3), `createApp` (Task 1).
- Produces:
  - `authRouter` mounted at `/api/auth`.
  - `requireAuth(req, res, next)` setting `req.user`, and `requireCsrfHeader(req, res, next)`, both from `middleware/auth.js`.
  - `seedAdmin({ email, password })` creating the first user only when the collection is empty.
  - Cookie name `philippe_token`; CSRF header `X-Requested-With: philippe-admin`.

- [ ] **Step 1: Write the failing test**

```js
// api/test/routes/auth.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { withDb } from '../helpers/db.js'
import { createApp } from '../../src/app.js'
import { seedAdmin } from '../../src/lib/seedAdmin.js'
import { User } from '../../src/models/User.js'

const db = withDb()
const app = () => createApp()

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  await db.start()
})
afterAll(db.stop)
beforeEach(async () => {
  await User.deleteMany({})
  await seedAdmin({ email: 'admin@example.com', password: 'correct horse battery' })
})

describe('seedAdmin', () => {
  it('does not create a second user when one already exists', async () => {
    await seedAdmin({ email: 'other@example.com', password: 'x' })
    expect(await User.countDocuments()).toBe(1)
  })

  it('stores a hash, never the password', async () => {
    const user = await User.findOne()
    expect(user.passwordHash).not.toContain('correct horse battery')
  })
})

describe('POST /api/auth/login', () => {
  it('sets an httpOnly cookie on success', async () => {
    const res = await request(app())
      .post('/api/auth/login')
      .send({ email: 'admin@example.com', password: 'correct horse battery' })
    expect(res.status).toBe(200)
    const cookie = res.headers['set-cookie'][0]
    expect(cookie).toMatch(/philippe_token=/)
    expect(cookie).toMatch(/HttpOnly/)
    expect(cookie).toMatch(/SameSite=Lax/)
  })

  it('gives the same generic error for a wrong password and an unknown email', async () => {
    const bad = await request(app()).post('/api/auth/login').send({ email: 'admin@example.com', password: 'nope' })
    const unknown = await request(app()).post('/api/auth/login').send({ email: 'nobody@example.com', password: 'nope' })
    expect(bad.status).toBe(401)
    expect(unknown.status).toBe(401)
    expect(bad.body).toEqual(unknown.body)
  })
})

describe('protected routes', () => {
  it('rejects a request with no cookie', async () => {
    const res = await request(app()).get('/api/auth/me')
    expect(res.status).toBe(401)
  })

  it('accepts a request with the login cookie', async () => {
    const agent = request.agent(app())
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'correct horse battery' })
    const res = await agent.get('/api/auth/me')
    expect(res.status).toBe(200)
    expect(res.body.email).toBe('admin@example.com')
  })

  it('trusts exactly one proxy hop, so the rate limiter sees real client IPs', () => {
    // Asserting the status code here would prove nothing: express-rate-limit
    // swallows its own validation error and serves the request either way. What
    // actually differs is IP attribution, and with no trust proxy every client
    // shares one bucket, letting anyone lock the only admin out of login.
    expect(createApp().get('trust proxy')).toBe(1)
  })

  it('logs in normally when Traefik has added X-Forwarded-For', async () => {
    const res = await request(app())
      .post('/api/auth/login')
      .set('X-Forwarded-For', '203.0.113.7')
      .send({ email: 'admin@example.com', password: 'correct horse battery' })
    expect(res.status).toBe(200)
    expect(res.headers['set-cookie'][0]).toMatch(/philippe_token=/)
  })

  it('rejects a mutation missing the CSRF header', async () => {
    const agent = request.agent(app())
    await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'correct horse battery' })
    const res = await agent.post('/api/auth/password').send({ password: 'new password here' })
    expect(res.status).toBe(403)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- auth`
Expected: FAIL, cannot resolve `seedAdmin.js`.

- [ ] **Step 3: Write the minimal implementation**

Add `bcryptjs` (`^2.4.3`), `jsonwebtoken` (`^9.0.2`), `express-rate-limit` (`^7.4.0`) to `api/package.json`.

```js
// api/src/lib/seedAdmin.js
import bcrypt from 'bcryptjs'
import { User } from '../models/User.js'

/** Creates the first admin only when the collection is empty. Never overwrites. */
export async function seedAdmin({ email, password }) {
  if (!email || !password) return null
  if ((await User.countDocuments()) > 0) return null
  const passwordHash = await bcrypt.hash(password, 12)
  return User.create({ email, passwordHash })
}
```

```js
// api/src/middleware/auth.js
import jwt from 'jsonwebtoken'
import { User } from '../models/User.js'

export const COOKIE_NAME = 'philippe_token'
export const CSRF_HEADER = 'x-requested-with'
export const CSRF_VALUE = 'philippe-admin'

export function signToken(user) {
  return jwt.sign({ sub: String(user._id) }, process.env.JWT_SECRET, { expiresIn: '12h' })
}

export function cookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 12 * 60 * 60 * 1000,
    path: '/',
  }
}

export async function requireAuth(req, res, next) {
  const token = req.cookies?.[COOKIE_NAME]
  if (!token) return res.status(401).json({ error: 'unauthorized' })
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET)
    const user = await User.findById(payload.sub)
    if (!user) return res.status(401).json({ error: 'unauthorized' })
    req.user = user
    next()
  } catch {
    res.status(401).json({ error: 'unauthorized' })
  }
}

/**
 * A cross-site form post cannot set a custom header, and SameSite=Lax already
 * blocks the cookie on cross-site POSTs. Together this is sufficient CSRF
 * protection without a token round trip.
 */
export function requireCsrfHeader(req, res, next) {
  if (req.get(CSRF_HEADER) !== CSRF_VALUE) return res.status(403).json({ error: 'forbidden' })
  next()
}
```

```js
// api/src/routes/auth.js
import { Router } from 'express'
import bcrypt from 'bcryptjs'
import rateLimit from 'express-rate-limit'
import { User } from '../models/User.js'
import { COOKIE_NAME, signToken, cookieOptions, requireAuth, requireCsrfHeader } from '../middleware/auth.js'

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'invalid credentials' },
})

export const authRouter = Router()

authRouter.post('/login', loginLimiter, async (req, res) => {
  const { email, password } = req.body || {}
  const user = email ? await User.findOne({ email: String(email).toLowerCase() }) : null
  // Same response for unknown email and wrong password: no account enumeration.
  const ok = user ? await bcrypt.compare(String(password || ''), user.passwordHash) : false
  if (!ok) return res.status(401).json({ error: 'invalid credentials' })
  res.cookie(COOKIE_NAME, signToken(user), cookieOptions())
  res.json({ email: user.email })
})

authRouter.post('/logout', (req, res) => {
  res.clearCookie(COOKIE_NAME, { path: '/' })
  res.json({ ok: true })
})

authRouter.get('/me', requireAuth, (req, res) => res.json({ email: req.user.email }))

authRouter.post('/password', requireAuth, requireCsrfHeader, async (req, res) => {
  const password = String(req.body?.password || '')
  if (password.length < 12) return res.status(400).json({ error: 'password must be at least 12 characters' })
  req.user.passwordHash = await bcrypt.hash(password, 12)
  await req.user.save()
  res.json({ ok: true })
})
```

Mount it in `api/src/app.js`, after `cookieParser()`, and trust the single proxy hop:

```js
import { authRouter } from './routes/auth.js'
// ...
// Traefik sets X-Forwarded-For. Without this, express-rate-limit's validator
// throws on every login in production while every local test still passes.
app.set('trust proxy', 1)
app.use('/api/auth', authRouter)
```

Then the startup path, which nothing else in the plan provides:

```js
// api/src/bootstrap.js
import { connect } from './db.js'
import { seedAdmin } from './lib/seedAdmin.js'

/**
 * Runs before the server listens. Config is validated FIRST, before any I/O:
 * jwt.sign throws synchronously on a falsy secret, from inside an async handler
 * Express 4 does not catch, which on Node 24 takes the process down at the first
 * login attempt. Better to refuse to start.
 */
export async function bootstrap() {
  if (!process.env.JWT_SECRET) throw new Error('JWT_SECRET is required')
  await connect()
  await seedAdmin({ email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
}
```

```js
// api/src/server.js
import { bootstrap } from './bootstrap.js'
import { createApp } from './app.js'

export function startServer(port = Number(process.env.PORT || 8080)) {
  return createApp().listen(port, () => console.log(`api listening on ${port}`))
}

if (import.meta.url === `file://${process.argv[1]}`) {
  bootstrap()
    .then(() => startServer())
    .catch((err) => {
      console.error('startup failed:', err.message)
      process.exit(1)
    })
}
```

The `JWT_SECRET` check lives in `bootstrap()` and not in `createApp()` on purpose:
test files call `createApp()` without setting a secret, and making the app
constructor throw would break them for no benefit.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- auth`
Expected: PASS, 7 tests.

- [ ] **Step 5: Commit**

```bash
git add api/package.json api/package-lock.json api/src/routes/auth.js api/src/middleware/auth.js api/src/lib/seedAdmin.js api/src/app.js api/test/routes/auth.test.js
git commit -m "feat(api): add cookie auth with rate limiting and CSRF header check"
```

---

### Task 7: Public read API

**Files:**
- Create: `api/src/routes/public.js`
- Modify: `api/src/app.js`
- Test: `api/test/routes/public.test.js`

**Interfaces:**
- Consumes: `Article`, `Page`, `Home`, `Image`, `resolveDoc`.
- Produces: `publicRouter` mounted at `/api`, serving `GET /articles`, `GET /articles/:slug`, `GET /pages/:key`, `GET /home`. Every response is language-resolved (plain strings, not `{fr, en}`). A `lang` query of `en` or `fr` defaults to `fr`.

- [ ] **Step 1: Write the failing test**

```js
// api/test/routes/public.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { withDb } from '../helpers/db.js'
import { createApp } from '../../src/app.js'
import { Article } from '../../src/models/Article.js'
import { Page } from '../../src/models/Page.js'
import { Image } from '../../src/models/Image.js'

const db = withDb()
beforeAll(db.start)
afterAll(db.stop)
beforeEach(async () => {
  await Article.deleteMany({})
  await Page.deleteMany({})
  // Images are cleared too: `filename` is unique, so a leftover row from the
  // previous test fails the next insert on a duplicate key.
  await Image.deleteMany({})
  // Every one of the 125 migrated archive posts has a featured image, so a
  // fixture whose article has no cover is not representative, and a slideshow
  // test built on one would pass even with image population entirely broken.
  const cover = await Image.create({
    filename: 'testcover',
    width: 2000,
    height: 1500,
    variants: {
      thumb: { path: 'ab/testcover-thumb.webp', width: 600, height: 450 },
      medium: { path: 'ab/testcover-medium.webp', width: 1400, height: 1050 },
      large: { path: 'ab/testcover-large.webp', width: 2000, height: 1500 },
    },
  })
  await Article.create([
    { category: 'works', status: 'published', slug: { fr: 'chassis', en: 'press-frame' },
      title: { fr: 'Châssis-Presse', en: '' }, yearStart: 2018, yearEnd: 2021, yearLabel: { fr: '2018-2021' } },
    { category: 'works', status: 'published', slug: { fr: 'porte' },
      title: { fr: 'Porte' }, yearStart: 2023, cover: cover._id },
    { category: 'works', status: 'draft', slug: { fr: 'brouillon' }, title: { fr: 'Brouillon' } },
    { category: 'exhibitions', status: 'published', slug: { fr: 'expo' }, title: { fr: 'Expo' }, yearStart: 2020 },
  ])
})

describe('GET /api/articles', () => {
  it('excludes drafts', async () => {
    const res = await request(createApp()).get('/api/articles')
    expect(res.body.items.map((a) => a.slug)).not.toContain('brouillon')
  })

  it('filters by category and sorts by year descending', async () => {
    const res = await request(createApp()).get('/api/articles?category=works')
    expect(res.body.items.map((a) => a.slug)).toEqual(['porte', 'chassis'])
  })

  it('resolves titles into the requested language, falling back to French', async () => {
    const res = await request(createApp()).get('/api/articles?category=works&lang=en')
    const item = res.body.items.find((a) => a.slug === 'press-frame')
    expect(item.title).toBe('Châssis-Presse')
  })

  it('rejects an unknown category', async () => {
    const res = await request(createApp()).get('/api/articles?category=sculpture')
    expect(res.status).toBe(400)
  })
})

describe('GET /api/articles/:slug', () => {
  it('finds an article by its French or English slug', async () => {
    expect((await request(createApp()).get('/api/articles/chassis')).status).toBe(200)
    expect((await request(createApp()).get('/api/articles/press-frame?lang=en')).status).toBe(200)
  })

  it('returns 404 for a draft', async () => {
    expect((await request(createApp()).get('/api/articles/brouillon')).status).toBe(404)
  })

  it('includes previous and next within the same category', async () => {
    const res = await request(createApp()).get('/api/articles/porte')
    expect(res.body.next.slug).toBe('chassis')
    expect(res.body.prev).toBeNull()
  })
})

describe('GET /api/pages/:key', () => {
  it('returns an empty page rather than 404 for a valid unseeded key', async () => {
    const res = await request(createApp()).get('/api/pages/biography')
    expect(res.status).toBe(200)
    expect(res.body.blocks).toEqual([])
  })

  it('rejects an unknown key', async () => {
    expect((await request(createApp()).get('/api/pages/nonsense')).status).toBe(400)
  })
})

describe('GET /api/home', () => {
  it('builds the slideshow from featured articles', async () => {
    await Article.updateOne({ 'slug.fr': 'porte' }, { featured: true })
    const res = await request(createApp()).get('/api/home')
    expect(res.status).toBe(200)
    expect(res.body.slides.map((s) => s.article.slug)).toEqual(['porte'])
    // Proves the Image model is registered and the ref actually populates.
    expect(res.body.slides[0].image.variants.medium.path).toBe('ab/testcover-medium.webp')
  })

  it('omits a featured work that has no cover, since a slide needs an image', async () => {
    await Article.create({ category: 'works', status: 'published', slug: { fr: 'sans-image' }, title: { fr: 'Sans image' }, featured: true })
    const res = await request(createApp()).get('/api/home')
    expect(res.body.slides.map((s) => s.article.slug)).not.toContain('sans-image')
  })

  it('returns an empty slideshow rather than failing when nothing is featured', async () => {
    const res = await request(createApp()).get('/api/home')
    expect(res.status).toBe(200)
    expect(res.body.slides).toEqual([])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- public`
Expected: FAIL, 404s because `publicRouter` is not mounted.

- [ ] **Step 3: Write the minimal implementation**

```js
// api/src/routes/public.js
import { Router } from 'express'
import { Article } from '../models/Article.js'
import { Page } from '../models/Page.js'
import { Home } from '../models/Home.js'
// Registered for its side effect only: every populate path here refs 'Image',
// and nothing else in the process loads that model, so without this import
// mongoose throws MissingSchemaError and the request hangs.
import '../models/Image.js'
import { resolveDoc } from '../lib/localize.js'
import { CATEGORIES, PAGE_KEYS } from '../lib/constants.js'

export const publicRouter = Router()

const langOf = (req) => (req.query.lang === 'en' ? 'en' : 'fr')
const LIST_FIELDS = 'slug title yearLabel yearStart yearEnd category cover position featured'

publicRouter.get('/articles', async (req, res) => {
  const lang = langOf(req)
  const { category } = req.query
  if (category && !CATEGORIES.includes(category)) return res.status(400).json({ error: 'unknown category' })

  const query = { status: 'published', ...(category ? { category } : {}) }
  const items = await Article.find(query)
    .select(LIST_FIELDS)
    .sort({ position: 1, yearStart: -1, createdAt: -1 })
    .populate('cover')
    .lean()

  res.json({ items: items.map((a) => resolveDoc(a, lang)), total: items.length })
})

publicRouter.get('/articles/:slug', async (req, res) => {
  const lang = langOf(req)
  const { slug } = req.params
  const article = await Article.findOne({
    status: 'published',
    $or: [{ 'slug.fr': slug }, { 'slug.en': slug }],
  })
    .populate('cover')
    .populate('blocks.image')
    .populate('blocks.items.image')
    .lean()
  if (!article) return res.status(404).json({ error: 'not found' })

  const siblings = await Article.find({ status: 'published', category: article.category })
    .select(LIST_FIELDS)
    .sort({ position: 1, yearStart: -1, createdAt: -1 })
    .lean()
  const i = siblings.findIndex((s) => String(s._id) === String(article._id))

  res.json({
    ...resolveDoc(article, lang),
    prev: i > 0 ? resolveDoc(siblings[i - 1], lang) : null,
    next: i >= 0 && i < siblings.length - 1 ? resolveDoc(siblings[i + 1], lang) : null,
  })
})

publicRouter.get('/pages/:key', async (req, res) => {
  const { key } = req.params
  if (!PAGE_KEYS.includes(key)) return res.status(400).json({ error: 'unknown page' })
  const page =
    (await Page.findOne({ key }).populate('blocks.image').populate('blocks.items.image').lean()) ||
    { key, title: { fr: '', en: '' }, blocks: [] }
  res.json(resolveDoc(page, langOf(req)))
})

publicRouter.get('/home', async (req, res) => {
  const lang = langOf(req)
  const home = await Home.findOne({ singleton: 'home' }).populate('slides.image').populate('slides.article').lean()

  // The slideshow IS the featured works. `featured` ("en avant") is the single
  // toggle the editor sets on an article; nothing is curated twice.
  if (!home?.slides?.length) {
    // `cover: { $ne: null }` also excludes documents missing the field entirely
    // (verified against MongoDB). That is deliberate: a slide with no image
    // cannot render, so an imageless featured work is omitted here rather than
    // emitted as a broken slide. Task 21's editor warns when "en avant" is
    // ticked on a work with no cover, which is where that should surface.
    const featured = await Article.find({ status: 'published', featured: true, cover: { $ne: null } })
      .select(LIST_FIELDS)
      .sort({ position: 1, yearStart: -1 })
      .populate('cover')
      .lean()
    const slides = featured.map((a) => ({ image: a.cover, article: a, caption: a.title }))
    return res.json(resolveDoc({ slides }, lang))
  }
  res.json(resolveDoc(home, lang))
})
```

Mount in `api/src/app.js`: `app.use('/api', publicRouter)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- public`
Expected: PASS, 10 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/public.js api/src/app.js api/test/routes/public.test.js
git commit -m "feat(api): add public read API with language resolution"
```

---

### Task 8: Admin content API

**Files:**
- Create: `api/src/routes/admin.js`
- Modify: `api/src/app.js`
- Test: `api/test/routes/admin.test.js`, `api/test/helpers/agent.js`

**Interfaces:**
- Consumes: `requireAuth`, `requireCsrfHeader`, `sanitize`, `slugify`, `uniqueSlug`, all models.
- Produces: `adminRouter` mounted at `/api/admin` with articles CRUD, `POST /articles/reorder`, `PATCH /pages/:key`. Responses keep raw `{fr, en}` objects so the editor can tell an override from a fallback. Test helper `loginAgent(app)` returning a supertest agent with the cookie and CSRF header preset.

- [ ] **Step 1: Write the failing test**

```js
// api/test/routes/admin.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import request from 'supertest'
import { withDb } from '../helpers/db.js'
import { loginAgent } from '../helpers/agent.js'
import { createApp } from '../../src/app.js'
import { Article } from '../../src/models/Article.js'
import { Page } from '../../src/models/Page.js'

const db = withDb()
beforeAll(async () => { process.env.JWT_SECRET = 'test-secret'; await db.start() })
afterAll(db.stop)
beforeEach(async () => { await Article.deleteMany({}); await Page.deleteMany({}) })

describe('admin articles', () => {
  it('requires authentication', async () => {
    expect((await request(createApp()).get('/api/admin/articles')).status).toBe(401)
  })

  it('lists drafts alongside published articles', async () => {
    await Article.create({ category: 'works', slug: { fr: 'd' }, title: { fr: 'D' }, status: 'draft' })
    const agent = await loginAgent()
    const res = await agent.get('/api/admin/articles')
    expect(res.body.items).toHaveLength(1)
  })

  it('returns raw localized objects, not resolved strings', async () => {
    await Article.create({ category: 'works', slug: { fr: 'r' }, title: { fr: 'Titre', en: '' } })
    const agent = await loginAgent()
    const res = await agent.get('/api/admin/articles')
    expect(res.body.items[0].title).toEqual({ fr: 'Titre', en: '' })
  })

  it('derives a unique French slug from the title when none is given', async () => {
    const agent = await loginAgent()
    await agent.post('/api/admin/articles').send({ category: 'works', title: { fr: 'Châssis-Presse' } })
    const second = await agent.post('/api/admin/articles').send({ category: 'works', title: { fr: 'Châssis-Presse' } })
    expect(second.body.slug.fr).toBe('chassis-presse-2')
  })

  it('sanitizes HTML in text blocks on write', async () => {
    const agent = await loginAgent()
    const res = await agent.post('/api/admin/articles').send({
      category: 'works',
      title: { fr: 'T' },
      blocks: [{ type: 'text', value: { fr: '<p class="x" style="color:red">Hi</p><script>alert(1)</script>' } }],
    })
    expect(res.body.blocks[0].value.fr).toBe('<p>Hi</p>')
  })

  it('reorders articles by the supplied id list', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'a' }, title: { fr: 'A' } })
    const b = await Article.create({ category: 'works', slug: { fr: 'b' }, title: { fr: 'B' } })
    const agent = await loginAgent()
    await agent.post('/api/admin/articles/reorder').send({ ids: [String(b._id), String(a._id)] })
    expect((await Article.findById(b._id)).position).toBe(0)
    expect((await Article.findById(a._id)).position).toBe(1)
  })

  it('deletes an article', async () => {
    const a = await Article.create({ category: 'works', slug: { fr: 'x' }, title: { fr: 'X' } })
    const agent = await loginAgent()
    await agent.delete(`/api/admin/articles/${a._id}`)
    expect(await Article.countDocuments()).toBe(0)
  })
})

describe('admin pages', () => {
  it('upserts a page by key', async () => {
    const agent = await loginAgent()
    const res = await agent.patch('/api/admin/pages/biography').send({ title: { fr: 'Biographie' } })
    expect(res.status).toBe(200)
    expect(await Page.countDocuments({ key: 'biography' })).toBe(1)
  })

  it('rejects an unknown page key', async () => {
    const agent = await loginAgent()
    expect((await agent.patch('/api/admin/pages/nonsense').send({})).status).toBe(400)
  })
})
```

```js
// api/test/helpers/agent.js
import request from 'supertest'
import { createApp } from '../../src/app.js'
import { seedAdmin } from '../../src/lib/seedAdmin.js'
import { User } from '../../src/models/User.js'
import { CSRF_VALUE } from '../../src/middleware/auth.js'

/** A logged-in supertest agent that always sends the CSRF header. */
export async function loginAgent() {
  await User.deleteMany({})
  await seedAdmin({ email: 'admin@example.com', password: 'correct horse battery' })
  const agent = request.agent(createApp())
  await agent.post('/api/auth/login').send({ email: 'admin@example.com', password: 'correct horse battery' })
  for (const method of ['get', 'post', 'patch', 'delete']) {
    const original = agent[method].bind(agent)
    agent[method] = (url) => original(url).set('X-Requested-With', CSRF_VALUE)
  }
  return agent
}
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- admin`
Expected: FAIL, 404 because `adminRouter` is not mounted.

- [ ] **Step 3: Write the minimal implementation**

```js
// api/src/routes/admin.js
import { Router } from 'express'
import { Article } from '../models/Article.js'
import { Page } from '../models/Page.js'
import { requireAuth, requireCsrfHeader } from '../middleware/auth.js'
import { sanitize } from '../lib/sanitize.js'
import { uniqueSlug } from '../lib/slug.js'
import { localize } from '../lib/localize.js'
import { PAGE_KEYS } from '../lib/constants.js'

export const adminRouter = Router()
adminRouter.use(requireAuth)
adminRouter.use((req, res, next) => (req.method === 'GET' ? next() : requireCsrfHeader(req, res, next)))

/** Text blocks are the only place stored HTML exists, so sanitize on write. */
function cleanBlocks(blocks = []) {
  return blocks.map((b) =>
    b.type === 'text'
      ? { ...b, value: { fr: sanitize(b.value?.fr), en: sanitize(b.value?.en) } }
      : b
  )
}

async function ensureSlug(body, currentId = null) {
  const slug = { ...(body.slug || {}) }
  if (!slug.fr) {
    const taken = async (s) => {
      const hit = await Article.findOne({ 'slug.fr': s })
      return Boolean(hit) && String(hit._id) !== String(currentId)
    }
    slug.fr = await uniqueSlug(localize(body.title, 'fr') || 'article', taken)
  }
  return slug
}

adminRouter.get('/articles', async (req, res) => {
  const items = await Article.find().sort({ category: 1, position: 1, yearStart: -1 }).populate('cover').lean()
  res.json({ items, total: items.length })
})

adminRouter.get('/articles/:id', async (req, res) => {
  const article = await Article.findById(req.params.id).populate('cover').populate('blocks.image').populate('blocks.items.image').lean()
  if (!article) return res.status(404).json({ error: 'not found' })
  res.json(article)
})

adminRouter.post('/articles', async (req, res, next) => {
  try {
    const article = await Article.create({
      ...req.body,
      slug: await ensureSlug(req.body),
      blocks: cleanBlocks(req.body.blocks),
    })
    res.status(201).json(article.toObject())
  } catch (err) { next(err) }
})

adminRouter.patch('/articles/:id', async (req, res, next) => {
  try {
    const update = { ...req.body }
    if (update.blocks) update.blocks = cleanBlocks(update.blocks)
    if (update.slug) update.slug = await ensureSlug(update, req.params.id)
    const article = await Article.findByIdAndUpdate(req.params.id, update, { new: true, runValidators: true }).lean()
    if (!article) return res.status(404).json({ error: 'not found' })
    res.json(article)
  } catch (err) { next(err) }
})

adminRouter.delete('/articles/:id', async (req, res) => {
  await Article.findByIdAndDelete(req.params.id)
  res.json({ ok: true })
})

adminRouter.post('/articles/reorder', async (req, res) => {
  const ids = Array.isArray(req.body?.ids) ? req.body.ids : []
  await Promise.all(ids.map((id, position) => Article.findByIdAndUpdate(id, { position })))
  res.json({ ok: true })
})

adminRouter.get('/pages/:key', async (req, res) => {
  if (!PAGE_KEYS.includes(req.params.key)) return res.status(400).json({ error: 'unknown page' })
  const page = (await Page.findOne({ key: req.params.key }).lean()) || { key: req.params.key, blocks: [] }
  res.json(page)
})

adminRouter.patch('/pages/:key', async (req, res, next) => {
  try {
    const { key } = req.params
    if (!PAGE_KEYS.includes(key)) return res.status(400).json({ error: 'unknown page' })
    const update = { ...req.body, key }
    if (update.blocks) update.blocks = cleanBlocks(update.blocks)
    const page = await Page.findOneAndUpdate({ key }, update, { new: true, upsert: true, runValidators: true }).lean()
    res.json(page)
  } catch (err) { next(err) }
})

```

Mount in `api/src/app.js`: `app.use('/api/admin', adminRouter)`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- admin`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add api/src/routes/admin.js api/src/app.js api/test/routes/admin.test.js api/test/helpers/agent.js
git commit -m "feat(api): add admin content API with sanitizing and reordering"
```

---

### Task 9: Media upload and serving

**Files:**
- Create: `api/src/routes/media.js`, `api/src/middleware/upload.js`, `api/src/middleware/errors.js`
- Modify: `api/src/app.js`, `api/src/routes/admin.js` (image endpoints)
- Test: `api/test/routes/media.test.js`

**Interfaces:**
- Consumes: `processImage`, `Image`, `Article`, `Home`, auth middleware.
- Produces: `mediaRouter` mounted at `/media` serving files with a one-year immutable cache header, and refusing anything under `ORIGINALS_PREFIX`. Note `mediaPath(mediaRoot, relPath)` takes a variant's `path`, NOT the model's `filename` field (a bare hash that resolves to no file); admin endpoints `GET/POST /api/admin/images`, `PATCH /api/admin/images/:id`, `DELETE /api/admin/images/:id`; `errorHandler` producing `{ error }` with the right status.

- [ ] **Step 1: Write the failing test**

```js
// api/test/routes/media.test.js
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import request from 'supertest'
import sharp from 'sharp'
import { withDb } from '../helpers/db.js'
import { loginAgent } from '../helpers/agent.js'
import { createApp } from '../../src/app.js'
import { Image } from '../../src/models/Image.js'
import { Article } from '../../src/models/Article.js'

const db = withDb()
let root

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret'
  root = await mkdtemp(join(tmpdir(), 'media-api-'))
  process.env.MEDIA_ROOT = root
  await db.start()
})
afterAll(async () => { await db.stop(); await rm(root, { recursive: true, force: true }) })
beforeEach(async () => { await Image.deleteMany({}); await Article.deleteMany({}) })

const png = () => sharp({ create: { width: 900, height: 600, channels: 3, background: '#333' } }).png().toBuffer()

describe('POST /api/admin/images', () => {
  it('stores an uploaded image and returns its variants', async () => {
    const agent = await loginAgent()
    const res = await agent.post('/api/admin/images').attach('file', await png(), 'Porte.png')
    expect(res.status).toBe(201)
    expect(res.body.variants.thumb.width).toBe(600)
    expect(await Image.countDocuments()).toBe(1)
  })

  it('rejects a non-image upload', async () => {
    const agent = await loginAgent()
    const res = await agent.post('/api/admin/images').attach('file', Buffer.from('#!/bin/sh'), 'evil.sh')
    expect(res.status).toBe(400)
  })

  it('requires authentication', async () => {
    const res = await request(createApp()).post('/api/admin/images').attach('file', await png(), 'a.png')
    expect(res.status).toBe(401)
  })
})

describe('DELETE /api/admin/images/:id', () => {
  it('refuses to delete an image still used as a cover', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'a.png')
    await Article.create({ category: 'works', slug: { fr: 'a' }, title: { fr: 'A' }, cover: up.body._id })
    const res = await agent.delete(`/api/admin/images/${up.body._id}`)
    expect(res.status).toBe(409)
    expect(await Image.countDocuments()).toBe(1)
  })

  it('deletes an unused image', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'b.png')
    expect((await agent.delete(`/api/admin/images/${up.body._id}`)).status).toBe(200)
  })
})

describe('GET /media', () => {
  it('serves a stored variant with an immutable cache header', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'c.png')
    const res = await request(createApp()).get(`/media/${up.body.variants.thumb.path}`)
    expect(res.status).toBe(200)
    expect(res.headers['cache-control']).toMatch(/immutable/)
  })

  it('refuses a path traversal attempt', async () => {
    const res = await request(createApp()).get('/media/../../etc/passwd')
    expect(res.status).toBeGreaterThanOrEqual(400)
  })

  it('never serves an archival original', async () => {
    const agent = await loginAgent()
    const up = await agent.post('/api/admin/images').attach('file', await png(), 'd.png')
    const res = await request(createApp()).get(`/media/${up.body.variants.original.path}`)
    expect(res.status).toBe(404)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd api && npm test -- media`
Expected: FAIL, cannot resolve `upload.js`.

- [ ] **Step 3: Write the minimal implementation**

Add `multer` (`^1.4.5-lts.1`) to `api/package.json`.

```js
// api/src/middleware/upload.js
import multer from 'multer'

const ALLOWED = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/tiff'])

// Memory storage, because every file is re-encoded by sharp before it touches
// disk. Nothing the client sent is ever written verbatim.
export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 30 * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) =>
    ALLOWED.has(file.mimetype) ? cb(null, true) : cb(new UploadTypeError('unsupported file type')),
})

export class UploadTypeError extends Error {
  constructor(message) { super(message); this.status = 400 }
}
```

```js
// api/src/middleware/errors.js
export function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  const status = err.status || (err.name === 'ValidationError' ? 400 : err.code === 11000 ? 409 : 500)
  if (status === 500) console.error(err)
  res.status(status).json({ error: status === 500 ? 'internal error' : err.message })
}
```

```js
// api/src/routes/media.js
import { Router } from 'express'
import express from 'express'
import { ORIGINALS_PREFIX } from '../lib/imagePipeline.js'

export function mediaRouter(mediaRoot = process.env.MEDIA_ROOT || '/data/media') {
  const router = Router()
  // Archival masters are kept on disk but never served: they are the only
  // files that are not re-encoded, so they still carry their original metadata.
  router.use((req, res, next) =>
    req.path.split('/').includes(ORIGINALS_PREFIX) ? res.status(404).end() : next()
  )
  // Filenames are content hashes, so a given path's bytes never change.
  router.use(
    express.static(mediaRoot, {
      immutable: true,
      maxAge: '365d',
      fallthrough: false,
      dotfiles: 'deny',
      index: false,
    })
  )
  return router
}
```

Add the image endpoints to `api/src/routes/admin.js`:

```js
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import { Image } from '../models/Image.js'
import { processImage } from '../lib/imagePipeline.js'
import { upload } from '../middleware/upload.js'

const mediaRoot = () => process.env.MEDIA_ROOT || '/data/media'

adminRouter.get('/images', async (req, res) => {
  const items = await Image.find().sort({ createdAt: -1 }).lean()
  res.json({ items, total: items.length })
})

adminRouter.post('/images', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'no file' })
    const fields = await processImage(req.file.buffer, {
      originalName: req.file.originalname,
      mediaRoot: mediaRoot(),
    })
    const existing = await Image.findOne({ filename: fields.filename })
    if (existing) return res.status(201).json(existing.toObject())
    const image = await Image.create(fields)
    res.status(201).json(image.toObject())
  } catch (err) {
    if (/unsupported image/i.test(err.message)) err.status = 400
    next(err)
  }
})

adminRouter.patch('/images/:id', async (req, res, next) => {
  try {
    const image = await Image.findByIdAndUpdate(req.params.id, { alt: req.body?.alt }, { new: true }).lean()
    if (!image) return res.status(404).json({ error: 'not found' })
    res.json(image)
  } catch (err) { next(err) }
})

adminRouter.delete('/images/:id', async (req, res, next) => {
  try {
    const { id } = req.params
    // Deleting a referenced image would leave holes in the archive, so refuse.
    const used = await Article.exists({
      $or: [{ cover: id }, { 'blocks.image': id }, { 'blocks.items.image': id }],
    })
    if (used) return res.status(409).json({ error: 'image is in use' })
    const image = await Image.findById(id)
    if (!image) return res.status(404).json({ error: 'not found' })
    await Promise.all(
      Object.values(image.variants || {})
        .filter(Boolean)
        .map((v) => unlink(join(mediaRoot(), v.path)).catch(() => {}))
    )
    await image.deleteOne()
    res.json({ ok: true })
  } catch (err) { next(err) }
})
```

In `api/src/app.js`, mount `app.use('/media', mediaRouter())` before the API routes and `app.use(errorHandler)` last.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd api && npm test -- media`
Expected: PASS, 7 tests.

- [ ] **Step 5: Run the whole API suite and commit**

```bash
cd api && npm test
git add api/package.json api/package-lock.json api/src api/test
git commit -m "feat(api): add image upload, deletion guard and media serving"
```

---

## Phase 3: Migration

Source facts confirmed against the dump, so no discovery is needed during implementation:

- The WordPress table prefix is `CTL6P_`.
- Uploads live at `httpdocs/wp-content/uploads/YYYY/MM/` inside `backup_user-data_2608071937.tzst`, and `_wp_attached_file` holds paths relative to `uploads/`.
- WordPress also stores its own resized derivatives (files ending `-1000x796.jpg` and similar). The migration uses only the original named by `_wp_attached_file`, so sharp builds our variants from full quality sources.
- Article titles carry their date in the title itself, in the form `Nouveau | 2024`.
- Every published post has exactly one category and a `_thumbnail_id`.
- **Security:** the user-data archive is a full home directory backup containing `.ssh/id_rsa` and `wp-config.php` credentials. It is gitignored. Extract only what is needed, never commit extracted files, and do not copy the archive anywhere shared.

### Task 10: MariaDB access and extraction

**Files:**
- Create: `migrate/package.json`, `migrate/db.js`, `migrate/extract.js`, `migrate/README.md`
- Test: `migrate/test/extract.test.js`

**Interfaces:**
- Consumes: nothing from the API (the migration is a separate package).
- Produces:
  - `query(sql, params)` from `db.js`.
  - `extractAll()` from `extract.js` writing `migrate/data/{articles,pages,media}.json` and returning counts.
  - `pairByTrid(rows)`, `mapCategory(termName)`, `parseYearLabel(title)` as named exports of `extract.js`, all pure and unit tested.

- [ ] **Step 1: Write the failing test**

```js
// migrate/test/extract.test.js
import { describe, it, expect } from 'vitest'
import { pairByTrid, mapCategory, parseYearLabel } from '../extract.js'

describe('mapCategory', () => {
  it('maps both language names onto one canonical category', () => {
    expect(mapCategory('Œuvres')).toBe('works')
    expect(mapCategory('Works')).toBe('works')
    expect(mapCategory('Expositions')).toBe('exhibitions')
    expect(mapCategory('Éditions')).toBe('editions')
    expect(mapCategory('Editions')).toBe('editions')
    expect(mapCategory('Commandes publiques')).toBe('public-orders')
    expect(mapCategory('Public Orders')).toBe('public-orders')
  })

  it('throws on an unmapped category rather than guessing', () => {
    expect(() => mapCategory('Sculpture')).toThrow(/unmapped category/i)
  })
})

describe('parseYearLabel', () => {
  it('splits a trailing year off the title', () => {
    expect(parseYearLabel('Nouveau | 2024')).toEqual({ title: 'Nouveau', yearLabel: '2024', yearStart: 2024, yearEnd: 2024 })
  })

  it('handles a date range', () => {
    expect(parseYearLabel('Châssis-Presse | 2018-2021')).toEqual({
      title: 'Châssis-Presse', yearLabel: '2018-2021', yearStart: 2018, yearEnd: 2021,
    })
  })

  it('leaves a title with no trailing year alone', () => {
    expect(parseYearLabel('Biographie')).toEqual({ title: 'Biographie', yearLabel: '', yearStart: null, yearEnd: null })
  })

  it('does not treat a pipe inside a title as a year separator', () => {
    expect(parseYearLabel('Ampli | Boogie')).toEqual({ title: 'Ampli | Boogie', yearLabel: '', yearStart: null, yearEnd: null })
  })
})

describe('pairByTrid', () => {
  it('pairs French and English rows into one record', () => {
    const rows = [
      { ID: 1, trid: 10, language_code: 'fr', post_title: 'Porte | 2023', post_name: 'porte' },
      { ID: 2, trid: 10, language_code: 'en', post_title: 'Door | 2023', post_name: 'door' },
    ]
    const [pair] = pairByTrid(rows)
    expect(pair.fr.ID).toBe(1)
    expect(pair.en.ID).toBe(2)
  })

  it('uses the English row as the base when no French row exists', () => {
    const rows = [{ ID: 9, trid: 11, language_code: 'en', post_title: 'Nouveau | 2024', post_name: 'nouveau-2024' }]
    const [only] = pairByTrid(rows)
    expect(only.fr.ID).toBe(9)
    expect(only.enOnly).toBe(true)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd migrate && npm test`
Expected: FAIL, cannot resolve `../extract.js`.

- [ ] **Step 3: Write the minimal implementation**

```json
// migrate/package.json
{
  "name": "philippe-migrate",
  "private": true,
  "type": "module",
  "scripts": {
    "extract": "node extract.js",
    "load": "node load.js",
    "verify": "node verify.js",
    "test": "vitest run"
  },
  "dependencies": {
    "mysql2": "^3.11.0",
    "mongoose": "^8.6.0",
    "sharp": "^0.33.4",
    "sanitize-html": "^2.13.0"
  },
  "devDependencies": { "vitest": "^2.0.5" }
}
```

```js
// migrate/db.js
import mysql from 'mysql2/promise'

export const PREFIX = 'CTL6P_'

let pool
export function getPool() {
  pool ||= mysql.createPool({
    host: process.env.WP_MYSQL_HOST || '127.0.0.1',
    port: Number(process.env.WP_MYSQL_PORT || 3399),
    user: process.env.WP_MYSQL_USER || 'root',
    password: process.env.WP_MYSQL_PASSWORD || 'root',
    database: process.env.WP_MYSQL_DB || 'wp',
    charset: 'utf8mb4',
  })
  return pool
}

export async function query(sql, params = []) {
  const [rows] = await getPool().query(sql.replaceAll('{p}', PREFIX), params)
  return rows
}

export async function close() {
  if (pool) await pool.end()
  pool = undefined
}
```

```js
// migrate/extract.js
import { writeFile, mkdir } from 'node:fs/promises'
import { query, close } from './db.js'
import { mapElementorToBlocks } from './elementor.js'

const CATEGORY_MAP = {
  'Œuvres': 'works', 'Oeuvres': 'works', 'Works': 'works',
  'Expositions': 'exhibitions', 'Exhibitions': 'exhibitions',
  'Éditions': 'editions', 'Editions': 'editions',
  'Commandes publiques': 'public-orders', 'Public Orders': 'public-orders',
}

export function mapCategory(name) {
  const mapped = CATEGORY_MAP[String(name).trim()]
  if (!mapped) throw new Error(`unmapped category: ${name}`)
  return mapped
}

/** Titles carry their date as a trailing "| 2018-2021" segment. */
export function parseYearLabel(rawTitle) {
  const title = String(rawTitle || '').trim()
  const match = title.match(/^(.*?)\s*\|\s*((\d{4})(?:\s*-\s*(\d{4}))?)$/)
  if (!match) return { title, yearLabel: '', yearStart: null, yearEnd: null }
  return {
    title: match[1].trim(),
    yearLabel: match[2].replace(/\s*-\s*/, '-'),
    yearStart: Number(match[3]),
    yearEnd: Number(match[4] || match[3]),
  }
}

/** Groups WPML rows by trid. FR is the base; EN alone becomes the base. */
export function pairByTrid(rows) {
  const byTrid = new Map()
  for (const row of rows) {
    const entry = byTrid.get(row.trid) || {}
    entry[row.language_code] = row
    byTrid.set(row.trid, entry)
  }
  return [...byTrid.values()].map((entry) => ({
    fr: entry.fr || entry.en,
    en: entry.en || null,
    enOnly: !entry.fr && Boolean(entry.en),
  }))
}

async function metaFor(ids, key) {
  if (!ids.length) return new Map()
  const rows = await query(
    `SELECT post_id, meta_value FROM {p}postmeta WHERE meta_key = ? AND post_id IN (?)`,
    [key, ids]
  )
  return new Map(rows.map((r) => [r.post_id, r.meta_value]))
}

export async function extractAll({ outDir = new URL('./data/', import.meta.url).pathname } = {}) {
  await mkdir(outDir, { recursive: true })

  const postRows = await query(`
    SELECT p.ID, p.post_title, p.post_name, p.post_date, p.post_status,
           t.trid, t.language_code, term.name AS category_name
    FROM {p}posts p
    JOIN {p}icl_translations t ON t.element_id = p.ID AND t.element_type = 'post_post'
    JOIN {p}term_relationships r ON r.object_id = p.ID
    JOIN {p}term_taxonomy tt ON tt.term_taxonomy_id = r.term_taxonomy_id AND tt.taxonomy = 'category'
    JOIN {p}terms term ON term.term_id = tt.term_id
    WHERE p.post_type = 'post' AND p.post_status = 'publish'
  `)

  const ids = postRows.map((r) => r.ID)
  const elementor = await metaFor(ids, '_elementor_data')
  const thumbs = await metaFor(ids, '_thumbnail_id')

  const attachments = await query(`
    SELECT p.ID, p.post_title, p.post_mime_type, m.meta_value AS file
    FROM {p}posts p
    JOIN {p}postmeta m ON m.post_id = p.ID AND m.meta_key = '_wp_attached_file'
    WHERE p.post_type = 'attachment'
  `)

  const media = attachments
    .filter((a) => String(a.post_mime_type).startsWith('image/'))
    .map((a) => ({ legacyWpId: a.ID, file: a.file, mime: a.post_mime_type, originalName: a.file.split('/').pop() }))

  const articles = pairByTrid(postRows).map((pair) => {
    const base = parseYearLabel(pair.fr.post_title)
    const en = pair.en && !pair.enOnly ? parseYearLabel(pair.en.post_title) : null
    return {
      legacyWpId: pair.fr.ID,
      category: mapCategory(pair.fr.category_name),
      status: 'published',
      enOnly: pair.enOnly,
      slug: { fr: pair.fr.post_name, en: pair.en ? pair.en.post_name : '' },
      title: { fr: base.title, en: en ? en.title : '' },
      yearLabel: { fr: base.yearLabel, en: en ? en.yearLabel : '' },
      yearStart: base.yearStart,
      yearEnd: base.yearEnd,
      coverLegacyId: Number(thumbs.get(pair.fr.ID) || 0) || null,
      blocks: mapElementorToBlocks(
        JSON.parse(elementor.get(pair.fr.ID) || '[]'),
        JSON.parse((pair.en && elementor.get(pair.en.ID)) || 'null'),
        { postId: pair.fr.ID }
      ),
    }
  })

  const pageRows = await query(`
    SELECT p.ID, p.post_title, p.post_name, t.trid, t.language_code
    FROM {p}posts p
    JOIN {p}icl_translations t ON t.element_id = p.ID AND t.element_type = 'post_page'
    WHERE p.post_type = 'page' AND p.post_status = 'publish'
  `)
  const pageElementor = await metaFor(pageRows.map((r) => r.ID), '_elementor_data')
  const pages = pairByTrid(pageRows).map((pair) => ({
    legacyWpId: pair.fr.ID,
    sourceSlug: pair.fr.post_name,
    title: { fr: pair.fr.post_title, en: pair.en ? pair.en.post_title : '' },
    blocks: mapElementorToBlocks(
      JSON.parse(pageElementor.get(pair.fr.ID) || '[]'),
      JSON.parse((pair.en && pageElementor.get(pair.en.ID)) || 'null'),
      { postId: pair.fr.ID }
    ),
  }))

  await writeFile(`${outDir}/articles.json`, JSON.stringify(articles, null, 2))
  await writeFile(`${outDir}/pages.json`, JSON.stringify(pages, null, 2))
  await writeFile(`${outDir}/media.json`, JSON.stringify(media, null, 2))
  await close()
  return { articles: articles.length, pages: pages.length, media: media.length }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  extractAll().then((counts) => console.log('extracted', counts))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd migrate && npm install && npm test`
Expected: PASS, 9 tests. (`extract.js` imports `elementor.js`, so create a stub exporting `mapElementorToBlocks = () => []` if Task 11 is not yet done; Task 11 replaces it.)

- [ ] **Step 5: Commit**

```bash
git add migrate/package.json migrate/db.js migrate/extract.js migrate/test
git commit -m "feat(migrate): extract WordPress posts, pages and media to JSON"
```

---

### Task 11: Elementor to blocks mapping

The highest-risk piece of the migration: a silent mapping gap loses content permanently. It is a pure function so it can be tested exhaustively.

**Files:**
- Create: `migrate/elementor.js`
- Test: `migrate/test/elementor.test.js`

**Interfaces:**
- Consumes: `sanitize` logic (duplicated locally with the same whitelist, since `migrate` is a separate package from `api`).
- Produces: `mapElementorToBlocks(frNodes, enNodes, ctx)` returning the block array shape defined by the `Article` model in Task 3, with `image` fields holding `{ legacyWpId }` placeholders that Task 12 resolves to ObjectIds. Also `walkWidgets(nodes)` yielding widgets depth first, and `liftSpecs(html)` returning `[{type,...}]`.

- [ ] **Step 1: Write the failing test**

```js
// migrate/test/elementor.test.js
import { describe, it, expect } from 'vitest'
import { mapElementorToBlocks, liftSpecs, walkWidgets } from '../elementor.js'

const widget = (widgetType, settings) => ({ elType: 'widget', widgetType, settings })
const section = (children) => ({ elType: 'section', elements: [{ elType: 'column', elements: children }] })

describe('walkWidgets', () => {
  it('finds widgets nested inside sections and columns', () => {
    const tree = [section([widget('heading', { title: 'Titre' })])]
    expect([...walkWidgets(tree)].map((w) => w.widgetType)).toEqual(['heading'])
  })
})

describe('mapElementorToBlocks', () => {
  it('maps a text editor widget to a sanitized text block', () => {
    const blocks = mapElementorToBlocks([widget('text-editor', { editor: '<p class="x">Bonjour</p>' })], null, {})
    expect(blocks).toEqual([{ type: 'text', value: { fr: '<p>Bonjour</p>', en: '' } }])
  })

  it('maps a heading widget', () => {
    const blocks = mapElementorToBlocks([widget('heading', { title: 'Provenance', header_size: 'h3' })], null, {})
    expect(blocks).toEqual([{ type: 'heading', value: { fr: 'Provenance', en: '' }, level: 3 }])
  })

  it('maps an image widget to an image block with a legacy id placeholder', () => {
    const blocks = mapElementorToBlocks([widget('image', { image: { id: 4211, url: 'x.jpg' } })], null, {})
    expect(blocks).toEqual([
      { type: 'image', image: { legacyWpId: 4211 }, caption: { fr: '', en: '' }, size: 'wide' },
    ])
  })

  it('maps a gallery widget to one gallery block', () => {
    const blocks = mapElementorToBlocks(
      [widget('image-gallery', { wp_gallery: [{ id: 1 }, { id: 2 }] })],
      null,
      {}
    )
    expect(blocks[0].type).toBe('gallery')
    expect(blocks[0].items.map((i) => i.image.legacyWpId)).toEqual([1, 2])
  })

  it('maps a wpr-media-grid the same way as a gallery', () => {
    const blocks = mapElementorToBlocks([widget('wpr-media-grid', { images: [{ id: 7 }] })], null, {})
    expect(blocks[0].type).toBe('gallery')
    expect(blocks[0].items[0].image.legacyWpId).toBe(7)
  })

  it('drops chrome widgets', () => {
    const chrome = [widget('spacer', {}), widget('the7_nav-menu', {}), widget('post-navigation', {})]
    expect(mapElementorToBlocks(chrome, null, {})).toEqual([])
  })

  it('throws on an unknown widget rather than silently dropping content', () => {
    expect(() => mapElementorToBlocks([widget('countdown', {})], null, { postId: 42 })).toThrow(/countdown.*42/)
  })

  it('merges the English tree into the en side of each block, positionally', () => {
    const fr = [widget('text-editor', { editor: '<p>Bonjour</p>' })]
    const en = [widget('text-editor', { editor: '<p>Hello</p>' })]
    expect(mapElementorToBlocks(fr, en, {})).toEqual([
      { type: 'text', value: { fr: '<p>Bonjour</p>', en: '<p>Hello</p>' } },
    ])
  })

  it('leaves the English side empty when the trees differ in shape', () => {
    const fr = [widget('text-editor', { editor: '<p>Bonjour</p>' })]
    const en = [widget('heading', { title: 'Hello' })]
    expect(mapElementorToBlocks(fr, en, {})[0].value.en).toBe('')
  })
})

describe('liftSpecs', () => {
  it('splits a definition list out of surrounding text, preserving order', () => {
    const html = '<p>Avant</p><dl><dt>Tirage</dt><dd>3</dd><dt>Format</dt><dd>50x60</dd></dl><p>Après</p>'
    expect(liftSpecs(html)).toEqual([
      { type: 'text', html: '<p>Avant</p>' },
      { type: 'specs', items: [{ term: 'Tirage', value: '3' }, { term: 'Format', value: '50x60' }] },
      { type: 'text', html: '<p>Après</p>' },
    ])
  })

  it('returns a single text part when there is no definition list', () => {
    expect(liftSpecs('<p>Rien</p>')).toEqual([{ type: 'text', html: '<p>Rien</p>' }])
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd migrate && npm test -- elementor`
Expected: FAIL, cannot resolve `../elementor.js`.

- [ ] **Step 3: Write the minimal implementation**

```js
// migrate/elementor.js
import sanitizeHtml from 'sanitize-html'

const OPTIONS = {
  allowedTags: ['p', 'br', 'em', 'strong', 'a', 'ul', 'ol', 'li', 'dl', 'dt', 'dd', 'blockquote'],
  allowedAttributes: { a: ['href'] },
  allowedSchemes: ['http', 'https', 'mailto'],
}
const clean = (html) => (html ? sanitizeHtml(html, OPTIONS) : '')

const DROP = new Set(['spacer', 'the7_nav-menu', 'post-navigation', 'global'])

export function* walkWidgets(nodes = []) {
  for (const node of nodes || []) {
    if (node?.elType === 'widget') yield node
    if (node?.elements?.length) yield* walkWidgets(node.elements)
  }
}

/** Splits a <dl> out of a text blob so provenance data becomes structured. */
export function liftSpecs(html) {
  const parts = []
  const re = /<dl[\s\S]*?<\/dl>/gi
  let last = 0
  for (const match of html.matchAll(re)) {
    const before = html.slice(last, match.index).trim()
    if (before) parts.push({ type: 'text', html: before })
    const items = []
    const pairRe = /<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi
    for (const pair of match[0].matchAll(pairRe)) {
      items.push({ term: stripTags(pair[1]), value: stripTags(pair[2]) })
    }
    if (items.length) parts.push({ type: 'specs', items })
    last = match.index + match[0].length
  }
  const rest = html.slice(last).trim()
  if (rest) parts.push({ type: 'text', html: rest })
  return parts.length ? parts : [{ type: 'text', html }]
}

const stripTags = (s) => sanitizeHtml(s, { allowedTags: [], allowedAttributes: {} }).trim()

function galleryIds(settings) {
  const list = settings?.wp_gallery || settings?.images || settings?.gallery || []
  return list.map((i) => Number(i.id)).filter(Boolean)
}

function widgetToBlocks(widget, ctx) {
  const s = widget.settings || {}
  switch (widget.widgetType) {
    case 'text-editor':
      return liftSpecs(clean(s.editor || '')).map((part) =>
        part.type === 'specs'
          ? { type: 'specs', items: part.items.map((i) => ({ term: { fr: i.term, en: '' }, value: { fr: i.value, en: '' } })) }
          : { type: 'text', value: { fr: part.html, en: '' } }
      )
    case 'heading':
      return [{ type: 'heading', value: { fr: stripTags(s.title || ''), en: '' }, level: s.header_size === 'h3' ? 3 : 2 }]
    case 'image':
      return s.image?.id
        ? [{ type: 'image', image: { legacyWpId: Number(s.image.id) }, caption: { fr: '', en: '' }, size: 'wide' }]
        : []
    case 'image-gallery':
    case 'wpr-media-grid': {
      const ids = galleryIds(s)
      return ids.length
        ? [{ type: 'gallery', columns: 3, items: ids.map((id) => ({ image: { legacyWpId: id }, caption: { fr: '', en: '' } })) }]
        : []
    }
    default:
      if (DROP.has(widget.widgetType)) return []
      // Failing loudly is the point: a new mapping is cheap, lost content is not.
      throw new Error(`unknown Elementor widget "${widget.widgetType}" in post ${ctx.postId}`)
  }
}

export function mapElementorToBlocks(frNodes, enNodes, ctx = {}) {
  const fr = [...walkWidgets(frNodes)].flatMap((w) => widgetToBlocks(w, ctx))
  if (!enNodes) return fr
  const en = [...walkWidgets(enNodes)].flatMap((w) => widgetToBlocks(w, ctx))

  // Positional merge. Where the trees disagree, the English side stays empty
  // and the reader falls back to French, which is the correct default.
  return fr.map((block, i) => {
    const other = en[i]
    if (!other || other.type !== block.type) return block
    if (block.type === 'text' || block.type === 'heading') {
      return { ...block, value: { ...block.value, en: other.value.fr } }
    }
    if (block.type === 'specs') {
      return {
        ...block,
        items: block.items.map((item, j) => ({
          term: { ...item.term, en: other.items[j]?.term.fr || '' },
          value: { ...item.value, en: other.items[j]?.value.fr || '' },
        })),
      }
    }
    return block
  })
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd migrate && npm test -- elementor`
Expected: PASS, 12 tests.

- [ ] **Step 5: Run extraction against the real database and fix any unknown widget**

```bash
docker ps | grep pg-wp || docker run -d --name pg-wp -e MARIADB_ROOT_PASSWORD=root -e MARIADB_DATABASE=wp -p 3399:3306 mariadb:10.11
cd migrate && npm run extract
```

Expected: `extracted { articles: 63, pages: 7, media: <about 1196> }`. If it throws on an unknown widget, add that widget to the mapping (with a test) or to `DROP` if it is chrome, and re-run.

- [ ] **Step 6: Commit**

```bash
git add migrate/elementor.js migrate/test/elementor.test.js
git commit -m "feat(migrate): map Elementor widgets to content blocks"
```

---

### Task 12: Loading into MongoDB and disk

**Files:**
- Create: `migrate/load.js`, `migrate/extractUploads.sh`
- Test: `migrate/test/load.test.js`

**Interfaces:**
- Consumes: the JSON from Task 10, `mapElementorToBlocks` output shape, the API's models (imported from `../api/src/models/*.js`) and `processImage` from `../api/src/lib/imagePipeline.js`, so the migration and the running app can never drift apart.
- Produces: `loadAll({ dataDir, uploadsRoot, mediaRoot })` resolving to `{ images, articles, pages }` counts, and `resolveBlockImages(blocks, byLegacyId)`.

- [ ] **Step 1: Write the failing test**

```js
// migrate/test/load.test.js
import { describe, it, expect } from 'vitest'
import { resolveBlockImages } from '../load.js'

describe('resolveBlockImages', () => {
  const byLegacyId = new Map([[10, 'aaaaaaaaaaaaaaaaaaaaaaaa'], [11, 'bbbbbbbbbbbbbbbbbbbbbbbb']])

  it('replaces legacy placeholders with ObjectIds', () => {
    const blocks = [{ type: 'image', image: { legacyWpId: 10 }, caption: { fr: '', en: '' } }]
    expect(resolveBlockImages(blocks, byLegacyId)[0].image).toBe('aaaaaaaaaaaaaaaaaaaaaaaa')
  })

  it('resolves gallery items too', () => {
    const blocks = [{ type: 'gallery', items: [{ image: { legacyWpId: 11 } }] }]
    expect(resolveBlockImages(blocks, byLegacyId)[0].items[0].image).toBe('bbbbbbbbbbbbbbbbbbbbbbbb')
  })

  it('drops an image block whose file never made it, rather than storing a dangling ref', () => {
    const blocks = [{ type: 'image', image: { legacyWpId: 999 } }, { type: 'text', value: { fr: 'x' } }]
    const out = resolveBlockImages(blocks, byLegacyId)
    expect(out).toHaveLength(1)
    expect(out[0].type).toBe('text')
  })

  it('leaves text blocks untouched', () => {
    const blocks = [{ type: 'text', value: { fr: '<p>x</p>', en: '' } }]
    expect(resolveBlockImages(blocks, byLegacyId)).toEqual(blocks)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd migrate && npm test -- load`
Expected: FAIL, cannot resolve `../load.js`.

- [ ] **Step 3: Write the minimal implementation**

```bash
# migrate/extractUploads.sh
# Extracts only wp-content/uploads out of the 1.7GB home-directory archive.
# The archive also contains .ssh/id_rsa and wp-config.php: never extract all of it.
set -euo pipefail
TAR=${1:?path to backup_philippegronon.com_*.tar}
DEST=${2:-./uploads}
mkdir -p "$DEST"
tar xf "$TAR" -O backup_user-data_*.tzst \
  | zstd -dc \
  | tar xf - -C "$DEST" --strip-components=3 httpdocs/wp-content/uploads
echo "uploads extracted to $DEST"
```

```js
// migrate/load.js
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import mongoose from 'mongoose'
import { Article } from '../api/src/models/Article.js'
import { Page } from '../api/src/models/Page.js'
import { Image } from '../api/src/models/Image.js'
import { processImage } from '../api/src/lib/imagePipeline.js'
import { PAGE_KEYS } from '../api/src/lib/constants.js'

/** WordPress page slugs to our page keys. Unlisted pages are skipped. */
const PAGE_KEY_BY_SLUG = {
  accueil: 'home', home: 'home',
  oeuvres: 'works', works: 'works',
  biographie: 'biography', biography: 'biography',
  contact: 'contact',
  bibliographie: 'bibliography', bibliography: 'bibliography',
  liens: 'links', links: 'links',
  'mentions-legales': 'legal', 'terms-and-conditions': 'legal',
}

export function resolveBlockImages(blocks = [], byLegacyId) {
  const out = []
  for (const block of blocks) {
    if (block.type === 'image') {
      const id = byLegacyId.get(block.image?.legacyWpId)
      if (id) out.push({ ...block, image: id })
      continue // a missing file means no block, never a dangling reference
    }
    if (block.type === 'gallery') {
      const items = (block.items || [])
        .map((i) => ({ ...i, image: byLegacyId.get(i.image?.legacyWpId) }))
        .filter((i) => i.image)
      if (items.length) out.push({ ...block, items })
      continue
    }
    out.push(block)
  }
  return out
}

export async function loadAll({ dataDir, uploadsRoot, mediaRoot, mongoUri, dbName = 'philippe' }) {
  await mongoose.connect(mongoUri, { dbName })
  const read = async (name) => JSON.parse(await readFile(join(dataDir, name), 'utf8'))
  const [articles, pages, media] = await Promise.all([read('articles.json'), read('pages.json'), read('media.json')])

  const byLegacyId = new Map()
  let imported = 0
  for (const item of media) {
    const existing = await Image.findOne({ legacyWpId: item.legacyWpId })
    if (existing) { byLegacyId.set(item.legacyWpId, existing._id); continue }
    let buffer
    try {
      buffer = await readFile(join(uploadsRoot, item.file))
    } catch {
      console.warn(`missing upload, skipped: ${item.file}`)
      continue
    }
    const fields = await processImage(buffer, { originalName: item.originalName, mediaRoot })
    const doc = await Image.findOneAndUpdate(
      { legacyWpId: item.legacyWpId },
      { ...fields, legacyWpId: item.legacyWpId, legacyUrl: `/wp-content/uploads/${item.file}` },
      { upsert: true, new: true }
    )
    byLegacyId.set(item.legacyWpId, doc._id)
    imported += 1
  }

  for (const a of articles) {
    await Article.findOneAndUpdate(
      { legacyWpId: a.legacyWpId },
      {
        category: a.category,
        status: a.status,
        slug: a.slug,
        title: a.title,
        yearLabel: a.yearLabel,
        yearStart: a.yearStart,
        yearEnd: a.yearEnd,
        cover: byLegacyId.get(a.coverLegacyId) || null,
        blocks: resolveBlockImages(a.blocks, byLegacyId),
        legacyWpId: a.legacyWpId,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
  }

  let pageCount = 0
  for (const p of pages) {
    const key = PAGE_KEY_BY_SLUG[p.sourceSlug]
    if (!key || !PAGE_KEYS.includes(key)) { console.warn(`unmapped page slug, skipped: ${p.sourceSlug}`); continue }
    await Page.findOneAndUpdate(
      { key },
      { key, title: p.title, blocks: resolveBlockImages(p.blocks, byLegacyId) },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    )
    pageCount += 1
  }

  await mongoose.disconnect()
  return { images: imported, articles: articles.length, pages: pageCount }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  loadAll({
    dataDir: new URL('./data/', import.meta.url).pathname,
    uploadsRoot: process.env.UPLOADS_ROOT || new URL('./uploads/', import.meta.url).pathname,
    mediaRoot: process.env.MEDIA_ROOT || '/tmp/philippe-media',
    mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27018',
  }).then((counts) => console.log('loaded', counts))
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd migrate && npm test -- load`
Expected: PASS, 4 tests.

- [ ] **Step 5: Run the real load against local MongoDB**

```bash
docker compose -f docker-compose.dev.yml up -d mongo
bash migrate/extractUploads.sh backup_philippegronon.com_2608071937.tar migrate/uploads
cd migrate && npm run load
```

Expected: `loaded { images: ~1196, articles: 63, pages: 7 }`. This takes several minutes because every image is re-encoded three times.

- [ ] **Step 6: Commit**

```bash
git add migrate/load.js migrate/extractUploads.sh migrate/test/load.test.js
git commit -m "feat(migrate): load articles, pages and images into MongoDB"
```

---

### Task 13: Migration verification

**Files:**
- Create: `migrate/verify.js`
- Test: `migrate/test/verify.test.js`

**Interfaces:**
- Consumes: models, the loaded database.
- Produces: `verify({ mongoUri, dbName, mediaRoot })` resolving to `{ ok, failures, warnings, report }`. Exit code 1 when `ok` is false.

- [ ] **Step 1: Write the failing test**

```js
// migrate/test/verify.test.js
import { describe, it, expect } from 'vitest'
import { checkCounts, checkArticles } from '../verify.js'

describe('checkCounts', () => {
  it('fails when the article count is not 63', () => {
    expect(checkCounts({ articles: 62, pages: 7 }).failures).toContain('expected 63 articles, found 62')
  })

  it('passes on the expected counts', () => {
    expect(checkCounts({ articles: 63, pages: 7 }).failures).toEqual([])
  })
})

describe('checkArticles', () => {
  it('fails an article with no cover', () => {
    const result = checkArticles([{ slug: { fr: 'a' }, cover: null, blocks: [{ type: 'text' }] }])
    expect(result.failures[0]).toMatch(/a.*cover/)
  })

  it('fails an article with no blocks', () => {
    const result = checkArticles([{ slug: { fr: 'b' }, cover: 'x', blocks: [] }])
    expect(result.failures[0]).toMatch(/b.*blocks/)
  })

  it('warns, rather than fails, when an article has no English slug', () => {
    const result = checkArticles([{ slug: { fr: 'c', en: '' }, cover: 'x', blocks: [{ type: 'text' }] }])
    expect(result.failures).toEqual([])
    expect(result.warnings[0]).toMatch(/c/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd migrate && npm test -- verify`
Expected: FAIL, cannot resolve `../verify.js`.

- [ ] **Step 3: Write the minimal implementation**

```js
// migrate/verify.js
import mongoose from 'mongoose'
import { access } from 'node:fs/promises'
import { join } from 'node:path'
import { Article } from '../api/src/models/Article.js'
import { Page } from '../api/src/models/Page.js'
import { Image } from '../api/src/models/Image.js'

export const EXPECTED_ARTICLES = 63
export const EXPECTED_PAGES = 7

export function checkCounts({ articles, pages }) {
  const failures = []
  if (articles !== EXPECTED_ARTICLES) failures.push(`expected ${EXPECTED_ARTICLES} articles, found ${articles}`)
  if (pages !== EXPECTED_PAGES) failures.push(`expected ${EXPECTED_PAGES} pages, found ${pages}`)
  return { failures }
}

export function checkArticles(articles) {
  const failures = []
  const warnings = []
  const seen = { fr: new Set(), en: new Set() }
  for (const a of articles) {
    const name = a.slug?.fr || String(a._id)
    if (!a.cover) failures.push(`article ${name} has no cover`)
    if (!a.blocks?.length) failures.push(`article ${name} has no blocks`)
    if (!a.slug?.en) warnings.push(`article ${name} has no English slug`)
    for (const lang of ['fr', 'en']) {
      const slug = a.slug?.[lang]
      if (!slug) continue
      if (seen[lang].has(slug)) failures.push(`duplicate ${lang} slug: ${slug}`)
      seen[lang].add(slug)
    }
  }
  return { failures, warnings }
}

export async function verify({ mongoUri, dbName = 'philippe', mediaRoot }) {
  await mongoose.connect(mongoUri, { dbName })
  const [articles, pages, images] = await Promise.all([
    Article.find().lean(), Page.find().lean(), Image.find().lean(),
  ])

  const failures = []
  const warnings = []
  failures.push(...checkCounts({ articles: articles.length, pages: pages.length }).failures)
  const articleCheck = checkArticles(articles)
  failures.push(...articleCheck.failures)
  warnings.push(...articleCheck.warnings)

  for (const image of images) {
    for (const [name, variant] of Object.entries(image.variants || {})) {
      if (!variant?.path) { failures.push(`image ${image.filename} missing ${name} variant`); continue }
      try { await access(join(mediaRoot, variant.path)) }
      catch { failures.push(`image ${image.filename} ${name} file missing on disk`) }
    }
  }

  const withEn = articles.filter((a) => a.title?.en || a.slug?.en).length
  const report = {
    articles: articles.length, pages: pages.length, images: images.length,
    articlesWithEnglish: withEn,
    byCategory: articles.reduce((acc, a) => ({ ...acc, [a.category]: (acc[a.category] || 0) + 1 }), {}),
  }

  await mongoose.disconnect()
  return { ok: failures.length === 0, failures, warnings, report }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  verify({
    mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27018',
    mediaRoot: process.env.MEDIA_ROOT || '/tmp/philippe-media',
  }).then((r) => {
    console.log(JSON.stringify(r.report, null, 2))
    r.warnings.forEach((w) => console.warn('warning:', w))
    r.failures.forEach((f) => console.error('FAIL:', f))
    process.exit(r.ok ? 0 : 1)
  })
}
```

- [ ] **Step 4: Run the test to verify it passes, then verify the real migration**

Run: `cd migrate && npm test -- verify && npm run verify`
Expected: tests PASS (6 tests); `npm run verify` prints a report with 63 articles, 7 pages, roughly 1196 images, `byCategory` showing `works: 34, exhibitions: 25, editions: 3, public-orders: 1`, and exits 0.

- [ ] **Step 5: Commit**

```bash
git add migrate/verify.js migrate/test/verify.test.js
git commit -m "feat(migrate): verify migration completeness and fail loudly on gaps"
```

---

## Phase 4: Frontend

### Task 14: Web scaffold, routing and language context

**Files:**
- Create: `package.json`, `vite.config.js`, `index.html`, `src/main.jsx`, `src/App.jsx`
- Create: `src/lib/{api.js,lang.jsx,routes.js}`
- Test: `src/lib/__tests__/{routes.test.js,lang.test.jsx}`

**Interfaces:**
- Consumes: the public API from Task 7.
- Produces:
  - `apiGet(path, params)` and `apiSend(method, path, body)` from `lib/api.js`; `apiSend` always sets `X-Requested-With: philippe-admin` and `credentials: 'include'`.
  - `LangProvider` and `useLang()` from `lib/lang.jsx`, where `useLang()` returns `{ lang, otherLang, href(routeKey, slug) }`.
  - `SEGMENTS` and `routeFor(key, lang, slug)` from `lib/routes.js`.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/__tests__/routes.test.js
import { describe, it, expect } from 'vitest'
import { routeFor, langFromPath } from '../routes.js'

describe('routeFor', () => {
  it('builds French paths without a prefix', () => {
    expect(routeFor('works', 'fr')).toBe('/oeuvres')
    expect(routeFor('works', 'fr', 'chassis-presse')).toBe('/oeuvres/chassis-presse')
    expect(routeFor('biography', 'fr')).toBe('/biographie')
  })

  it('builds English paths under /en', () => {
    expect(routeFor('works', 'en')).toBe('/en/works')
    expect(routeFor('works', 'en', 'press-frame')).toBe('/en/works/press-frame')
    expect(routeFor('home', 'en')).toBe('/en')
  })
})

describe('langFromPath', () => {
  it('detects English from the /en prefix and defaults to French', () => {
    expect(langFromPath('/en/works')).toBe('en')
    expect(langFromPath('/oeuvres')).toBe('fr')
    expect(langFromPath('/')).toBe('fr')
    expect(langFromPath('/entrepot')).toBe('fr') // not the /en prefix
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- routes`
Expected: FAIL, cannot resolve `../routes.js`.

- [ ] **Step 3: Write the minimal implementation**

```json
// package.json (repo root)
{
  "name": "philippe-web",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview",
    "prerender": "node prerender/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.26.0"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.0",
    "@testing-library/user-event": "^14.5.2",
    "@vitejs/plugin-react": "^4.3.1",
    "jsdom": "^25.0.0",
    "vite": "^5.4.0",
    "vitest": "^2.0.5"
  }
}
```

```js
// vite.config.js
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:8080',
      '/media': 'http://localhost:8080',
    },
  },
  test: { environment: 'jsdom', setupFiles: './src/setupTests.js', globals: true },
})
```

```js
// src/lib/routes.js
export const SEGMENTS = {
  home: { fr: '', en: '' },
  works: { fr: 'oeuvres', en: 'works' },
  exhibitions: { fr: 'expositions', en: 'exhibitions' },
  biography: { fr: 'biographie', en: 'biography' },
  contact: { fr: 'contact', en: 'contact' },
  bibliography: { fr: 'bibliographie', en: 'bibliography' },
  links: { fr: 'liens', en: 'links' },
  legal: { fr: 'mentions-legales', en: 'terms' },
}

export function routeFor(key, lang, slug) {
  const segment = SEGMENTS[key]?.[lang] ?? ''
  const parts = [lang === 'en' ? 'en' : null, segment || null, slug || null].filter(Boolean)
  return `/${parts.join('/')}`
}

export function langFromPath(pathname) {
  return pathname === '/en' || pathname.startsWith('/en/') ? 'en' : 'fr'
}
```

```jsx
// src/lib/lang.jsx
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
```

```js
// src/lib/api.js
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
```

Also create `src/setupTests.js` containing `import '@testing-library/jest-dom'`, `index.html` with `<div id="root">`, and `src/main.jsx` rendering `<BrowserRouter><LangProvider><App /></LangProvider></BrowserRouter>`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm install && npm test -- routes`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json vite.config.js index.html src/main.jsx src/lib src/setupTests.js
git commit -m "feat(web): scaffold Vite app with bilingual routing"
```

---

### Task 15: Design system and chrome

**Files:**
- Create: `src/design/tokens.css`, `src/design/base.css`
- Create: `src/public-site/components/{Header.jsx,Footer.jsx,Container.jsx}`
- Test: `src/public-site/components/__tests__/Header.test.jsx`

**Interfaces:**
- Consumes: `useLang`, `routeFor`.
- Produces: `<Header />`, `<Footer />`, `<Container>` and the CSS custom properties every later component uses.

- [ ] **Step 1: Write the failing test**

```jsx
// src/public-site/components/__tests__/Header.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../../../lib/lang.jsx'
import { Header } from '../Header.jsx'

const renderAt = (path) =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <LangProvider><Header /></LangProvider>
    </MemoryRouter>
  )

describe('Header', () => {
  it('shows the four French nav items', () => {
    renderAt('/')
    for (const label of ['Œuvres', 'Expositions', 'Biographie', 'Contact']) {
      expect(screen.getByRole('link', { name: label })).toBeInTheDocument()
    }
  })

  it('shows English nav items under /en', () => {
    renderAt('/en')
    expect(screen.getByRole('link', { name: 'Works' })).toHaveAttribute('href', '/en/works')
  })

  it('offers a toggle to the other language', () => {
    renderAt('/oeuvres')
    expect(screen.getByRole('link', { name: /english/i })).toHaveAttribute('href', '/en/works')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Header`
Expected: FAIL, cannot resolve `../Header.jsx`.

- [ ] **Step 3: Write the minimal implementation**

```css
/* src/design/tokens.css */
:root {
  --ink: #14110f;
  --ink-soft: #5d5751;
  --paper: #fbfaf8;
  --ground: #eeebe6;     /* letterbox ground behind images */
  --rule: #d9d4cc;

  --font-sans: "Helvetica Neue", Helvetica, Arial, sans-serif;

  /* Four steps, nothing between. */
  --text-s: 0.8125rem;
  --text-m: 1rem;
  --text-l: 1.375rem;
  --text-xl: 2.25rem;

  --space-1: 0.5rem;
  --space-2: 1rem;
  --space-3: 2rem;
  --space-4: 4rem;
  --space-5: 8rem;

  --container: 1440px;
  --gutter: clamp(1rem, 4vw, 3rem);
  --card-ratio: 4 / 3;
}
```

```jsx
// src/public-site/components/Container.jsx
export function Container({ children, as: Tag = 'div', ...rest }) {
  return <Tag className="container" {...rest}>{children}</Tag>
}
```

```jsx
// src/public-site/components/Header.jsx
import { NavLink, Link, useLocation } from 'react-router-dom'
import { useLang } from '../../lib/lang.jsx'
import { routeFor, SEGMENTS } from '../../lib/routes.js'

const NAV = [
  { key: 'works', fr: 'Œuvres', en: 'Works' },
  { key: 'exhibitions', fr: 'Expositions', en: 'Exhibitions' },
  { key: 'biography', fr: 'Biographie', en: 'Biography' },
  { key: 'contact', fr: 'Contact', en: 'Contact' },
]

/**
 * Maps the current path to its counterpart in the other language. Article
 * pages override this via the `translatedPath` prop, because only the article
 * knows its paired slug.
 */
function counterpartPath(pathname, lang, otherLang) {
  const stripped = lang === 'en' ? pathname.replace(/^\/en/, '') || '/' : pathname
  const [, segment, slug] = stripped.split('/')
  const key = Object.keys(SEGMENTS).find((k) => SEGMENTS[k][lang] === segment)
  return key ? routeFor(key, otherLang, slug) : routeFor('home', otherLang)
}

export function Header({ translatedPath }) {
  const { lang, otherLang, href } = useLang()
  const { pathname } = useLocation()
  const toggleHref = translatedPath || counterpartPath(pathname, lang, otherLang)

  return (
    <header className="site-header">
      <Link to={href('home')} className="wordmark">Philippe Gronon</Link>
      <nav aria-label={lang === 'fr' ? 'Navigation principale' : 'Main navigation'}>
        {NAV.map((item) => (
          <NavLink key={item.key} to={href(item.key)}>{item[lang]}</NavLink>
        ))}
      </nav>
      <Link to={toggleHref} className="lang-toggle" hrefLang={otherLang}>
        {otherLang === 'en' ? 'English' : 'Français'}
      </Link>
    </header>
  )
}
```

Write `Footer.jsx` linking `bibliography`, `links` and `legal` through `href()`, and `base.css` styling `.site-header` as a sticky flex row with a bottom rule, `.container` at `max-width: var(--container)` with `--gutter` padding.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- Header`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/design src/public-site/components
git commit -m "feat(web): add design tokens, header and footer"
```

---

### Task 16: Works page with decade grouping

**Files:**
- Create: `src/lib/groupByDecade.js`, `src/public-site/components/{ArticleCard.jsx,ArticleGrid.jsx}`, `src/public-site/pages/Works.jsx`
- Test: `src/lib/__tests__/groupByDecade.test.js`, `src/public-site/pages/__tests__/Works.test.jsx`

**Interfaces:**
- Consumes: `apiGet`, `useLang`, `routeFor`.
- Produces: `groupByDecade(articles)` returning `[{ decade: 2020, label: '2020s', items: [...] }]` sorted newest first; `<ArticleCard article={...} />`; `<ArticleGrid items={...} />`; the `Works` page which also renders the `editions` and `public-orders` sections beneath the works grid.

- [ ] **Step 1: Write the failing test**

```js
// src/lib/__tests__/groupByDecade.test.js
import { describe, it, expect } from 'vitest'
import { groupByDecade } from '../groupByDecade.js'

describe('groupByDecade', () => {
  it('groups by decade, newest first, items newest first inside', () => {
    const groups = groupByDecade([
      { slug: 'a', yearStart: 1988 },
      { slug: 'b', yearStart: 2021 },
      { slug: 'c', yearStart: 2023 },
      { slug: 'd', yearStart: 1995 },
    ])
    expect(groups.map((g) => g.decade)).toEqual([2020, 1990, 1980])
    expect(groups[0].items.map((i) => i.slug)).toEqual(['c', 'b'])
  })

  it('puts undated articles in a trailing group with a null decade', () => {
    const groups = groupByDecade([{ slug: 'x', yearStart: null }, { slug: 'y', yearStart: 2020 }])
    expect(groups.at(-1).decade).toBeNull()
    expect(groups.at(-1).items.map((i) => i.slug)).toEqual(['x'])
  })

  it('returns an empty array for no articles', () => {
    expect(groupByDecade([])).toEqual([])
  })
})
```

```jsx
// src/public-site/pages/__tests__/Works.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../../../lib/lang.jsx'
import * as api from '../../../lib/api.js'
import { Works } from '../Works.jsx'

const article = (slug, category, yearStart, featured = false) => ({
  _id: slug, slug, category, yearStart, featured, title: slug, yearLabel: String(yearStart || ''),
  cover: { variants: { thumb: { path: 't.webp', width: 600, height: 400 }, medium: { path: 'm.webp', width: 1400, height: 933 } } },
})

beforeEach(() => {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path, params) => {
    const byCategory = {
      works: [article('porte', 'works', 2023, true), article('chassis', 'works', 2018)],
      editions: [article('de', 'editions', 2009)],
      'public-orders': [article('tribunal', 'public-orders', 1984)],
    }
    if (path === '/pages/works') return { key: 'works', title: 'Œuvres', blocks: [] }
    return { items: byCategory[params.category] || [], total: 0 }
  })
})

describe('Works page', () => {
  it('renders decade headings above their works', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('heading', { name: '2020' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: '2010' })).toBeInTheDocument()
  })

  it('renders Éditions and Commandes publiques as sections beneath the works', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('heading', { name: 'Éditions' })).toBeInTheDocument())
    expect(screen.getByRole('heading', { name: 'Commandes publiques' })).toBeInTheDocument()
  })

  it('gives a featured work a double-width cell', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('link', { name: /porte/i })).toBeInTheDocument())
    expect(screen.getByRole('link', { name: /porte/i }).closest('li')).toHaveClass('is-featured')
    expect(screen.getByRole('link', { name: /chassis/i }).closest('li')).not.toHaveClass('is-featured')
  })

  it('links each card to its article', async () => {
    render(<MemoryRouter><LangProvider><Works /></LangProvider></MemoryRouter>)
    await waitFor(() => expect(screen.getByRole('link', { name: /porte/i })).toHaveAttribute('href', '/oeuvres/porte'))
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- groupByDecade Works`
Expected: FAIL, cannot resolve the new modules.

- [ ] **Step 3: Write the minimal implementation**

```js
// src/lib/groupByDecade.js
export function groupByDecade(articles = []) {
  const dated = articles.filter((a) => Number.isFinite(a.yearStart))
  const undated = articles.filter((a) => !Number.isFinite(a.yearStart))

  const byDecade = new Map()
  for (const a of dated) {
    const decade = Math.floor(a.yearStart / 10) * 10
    byDecade.set(decade, [...(byDecade.get(decade) || []), a])
  }

  const groups = [...byDecade.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([decade, items]) => ({
      decade,
      label: `${decade}`,
      items: items.sort((a, b) => b.yearStart - a.yearStart),
    }))

  if (undated.length) groups.push({ decade: null, label: '', items: undated })
  return groups
}
```

```jsx
// src/public-site/components/ArticleCard.jsx
import { Link } from 'react-router-dom'
import { useLang } from '../../lib/lang.jsx'

const mediaSrc = (variant) => (variant?.path ? `/media/${variant.path}` : '')

export function ArticleCard({ article, routeKey = 'works' }) {
  const { href } = useLang()
  const { cover } = article
  return (
    <Link to={href(routeKey, article.slug)} className="card">
      <div className="card-frame">
        {cover?.variants?.thumb && (
          <img
            src={mediaSrc(cover.variants.thumb)}
            srcSet={[cover.variants.thumb, cover.variants.medium]
              .filter(Boolean)
              .map((v) => `${mediaSrc(v)} ${v.width}w`)
              .join(', ')}
            sizes="(max-width: 700px) 100vw, 33vw"
            width={cover.variants.thumb.width}
            height={cover.variants.thumb.height}
            alt={cover.alt || ''}
            loading="lazy"
          />
        )}
      </div>
      <span className="card-title">{article.title}</span>
      {article.yearLabel && <span className="card-year">{article.yearLabel}</span>}
    </Link>
  )
}
```

```jsx
// src/public-site/components/ArticleGrid.jsx
import { ArticleCard } from './ArticleCard.jsx'

export function ArticleGrid({ items, routeKey }) {
  return (
    <ul className="grid">
      {items.map((article) => (
        // "en avant" works take a double-width cell. The card itself is
        // unchanged; only the cell it sits in grows, so the grid stays aligned.
        <li key={article._id || article.slug} className={article.featured ? 'is-featured' : undefined}>
          <ArticleCard article={article} routeKey={routeKey} />
        </li>
      ))}
    </ul>
  )
}
```

```jsx
// src/public-site/pages/Works.jsx
import { useEffect, useState } from 'react'
import { apiGet } from '../../lib/api.js'
import { useLang } from '../../lib/lang.jsx'
import { groupByDecade } from '../../lib/groupByDecade.js'
import { ArticleGrid } from '../components/ArticleGrid.jsx'
import { Container } from '../components/Container.jsx'
import { BlockRenderer } from '../components/BlockRenderer.jsx'

const SECTION_LABELS = {
  editions: { fr: 'Éditions', en: 'Editions' },
  'public-orders': { fr: 'Commandes publiques', en: 'Public Orders' },
}

export function Works() {
  const { lang } = useLang()
  const [state, setState] = useState({ works: [], editions: [], 'public-orders': [], intro: null })

  useEffect(() => {
    let cancelled = false
    Promise.all([
      apiGet('/articles', { category: 'works', lang }),
      apiGet('/articles', { category: 'editions', lang }),
      apiGet('/articles', { category: 'public-orders', lang }),
      apiGet('/pages/works', { lang }),
    ]).then(([works, editions, orders, intro]) => {
      if (cancelled) return
      setState({ works: works.items, editions: editions.items, 'public-orders': orders.items, intro })
    })
    return () => { cancelled = true }
  }, [lang])

  return (
    <Container as="main">
      {state.intro?.blocks?.length > 0 && (
        <section className="page-intro"><BlockRenderer blocks={state.intro.blocks} /></section>
      )}

      {groupByDecade(state.works).map((group) => (
        <section key={group.decade ?? 'undated'} className="decade">
          {group.label && <h2 className="decade-heading">{group.label}</h2>}
          <ArticleGrid items={group.items} routeKey="works" />
        </section>
      ))}

      {['editions', 'public-orders'].map((key) =>
        state[key].length ? (
          <section key={key} className="category-section">
            <h2>{SECTION_LABELS[key][lang]}</h2>
            <ArticleGrid items={state[key]} routeKey="works" />
          </section>
        ) : null
      )}
    </Container>
  )
}
```

Note: `editions` and `public-orders` articles use `routeKey="works"` so their
detail pages live under `/oeuvres/:slug`, matching the current site where they
are part of the works archive.

Ordering note: `Works.jsx` imports `BlockRenderer`, which Task 17 creates. If
you are working strictly in order, add a one-line stub now and let Task 17
replace it:

```jsx
// src/public-site/components/BlockRenderer.jsx (stub, replaced in Task 17)
export function BlockRenderer() { return null }
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- groupByDecade Works`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/groupByDecade.js src/public-site/components src/public-site/pages/Works.jsx src/lib/__tests__ src/public-site/pages/__tests__
git commit -m "feat(web): add works page with decade grouping and category sections"
```

---

### Task 17: Article page, block renderer and lightbox

**Files:**
- Create: `src/public-site/components/{BlockRenderer.jsx,Lightbox.jsx}`, `src/public-site/pages/ArticleDetail.jsx`
- Test: `src/public-site/components/__tests__/BlockRenderer.test.jsx`

**Interfaces:**
- Consumes: `apiGet`, `useLang`.
- Produces: `<BlockRenderer blocks={[]} />` handling all five block types, `<Lightbox images={[]} index={n} onClose={fn} />`, and the `ArticleDetail` page including prev/next.

- [ ] **Step 1: Write the failing test**

```jsx
// src/public-site/components/__tests__/BlockRenderer.test.jsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockRenderer } from '../BlockRenderer.jsx'

const img = (path) => ({ _id: path, alt: 'une porte', variants: { medium: { path, width: 1400, height: 900 }, large: { path, width: 2400, height: 1600 } } })

describe('BlockRenderer', () => {
  it('renders a text block as HTML', () => {
    render(<BlockRenderer blocks={[{ type: 'text', value: '<p>Bonjour <em>monde</em></p>' }]} />)
    expect(screen.getByText('monde')).toBeInTheDocument()
  })

  it('renders a heading at the requested level', () => {
    render(<BlockRenderer blocks={[{ type: 'heading', value: 'Provenance', level: 3 }]} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Provenance' })).toBeInTheDocument()
  })

  it('renders a specs block as a definition list', () => {
    render(<BlockRenderer blocks={[{ type: 'specs', items: [{ term: 'Tirage', value: '3' }] }]} />)
    expect(screen.getByText('Tirage').tagName).toBe('DT')
    expect(screen.getByText('3').tagName).toBe('DD')
  })

  it('renders an image with alt text and explicit dimensions', () => {
    render(<BlockRenderer blocks={[{ type: 'image', image: img('a.webp'), caption: 'Légende' }]} />)
    const image = screen.getByAltText('une porte')
    expect(image).toHaveAttribute('width', '1400')
    expect(screen.getByText('Légende')).toBeInTheDocument()
  })

  it('opens the lightbox when a gallery image is activated', async () => {
    render(<BlockRenderer blocks={[{ type: 'gallery', columns: 3, items: [{ image: img('g.webp') }] }]} />)
    await userEvent.click(screen.getByRole('button', { name: /une porte/i }))
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('lets a gallery item span several columns', () => {
    render(<BlockRenderer blocks={[{ type: 'gallery', columns: 6, items: [{ image: img('a.webp'), span: 4 }, { image: img('b.webp') }] }]} />)
    const cells = screen.getAllByRole('listitem')
    expect(cells[0]).toHaveStyle({ gridColumn: 'span 4' })
    expect(cells[1]).toHaveStyle({ gridColumn: 'span 1' })
  })

  it('clamps a span wider than the gallery to the column count', () => {
    render(<BlockRenderer blocks={[{ type: 'gallery', columns: 2, items: [{ image: img('a.webp'), span: 5 }] }]} />)
    expect(screen.getAllByRole('listitem')[0]).toHaveStyle({ gridColumn: 'span 2' })
  })

  it('ignores an unknown block type instead of crashing the page', () => {
    render(<BlockRenderer blocks={[{ type: 'video', value: 'x' }, { type: 'text', value: '<p>ok</p>' }]} />)
    expect(screen.getByText('ok')).toBeInTheDocument()
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- BlockRenderer`
Expected: FAIL, cannot resolve `../BlockRenderer.jsx`.

- [ ] **Step 3: Write the minimal implementation**

```jsx
// src/public-site/components/BlockRenderer.jsx
import { useState } from 'react'
import { Lightbox } from './Lightbox.jsx'

const src = (v) => (v?.path ? `/media/${v.path}` : '')

function Picture({ image, sizes = '100vw' }) {
  const medium = image?.variants?.medium
  const large = image?.variants?.large
  if (!medium) return null
  return (
    <img
      src={src(medium)}
      srcSet={[medium, large].filter(Boolean).map((v) => `${src(v)} ${v.width}w`).join(', ')}
      sizes={sizes}
      width={medium.width}
      height={medium.height}
      alt={image.alt || ''}
      loading="lazy"
    />
  )
}

export function BlockRenderer({ blocks = [] }) {
  const [lightbox, setLightbox] = useState(null)

  return (
    <>
      {blocks.map((block, i) => {
        switch (block.type) {
          case 'text':
            // Server-sanitized on write, so this is safe to inject.
            return <div key={i} className="block-text" dangerouslySetInnerHTML={{ __html: block.value }} />
          case 'heading': {
            const Tag = block.level === 3 ? 'h3' : 'h2'
            return <Tag key={i} className="block-heading">{block.value}</Tag>
          }
          case 'specs':
            return (
              <dl key={i} className="block-specs">
                {(block.items || []).map((item, j) => (
                  <div key={j}>
                    <dt>{item.term}</dt>
                    <dd>{item.value}</dd>
                  </div>
                ))}
              </dl>
            )
          case 'image':
            return (
              <figure key={i} className={`block-image size-${block.size || 'wide'}`}>
                <Picture image={block.image} />
                {block.caption && <figcaption>{block.caption}</figcaption>}
              </figure>
            )
          case 'gallery': {
            const items = block.items || []
            return (
              <ul key={i} className="block-gallery" style={{ '--columns': block.columns || 3 }}>
                {items.map((item, j) => (
                  // span is the per-image grid setting. Clamped to the block's
                  // column count so lowering `columns` later cannot break the grid.
                  <li key={j} style={{ gridColumn: `span ${Math.min(item.span || 1, block.columns || 3)}` }}>
                    <button
                      type="button"
                      aria-label={item.image?.alt || `Image ${j + 1}`}
                      onClick={() => setLightbox({ images: items.map((it) => it.image), index: j })}
                    >
                      <Picture image={item.image} sizes="33vw" />
                    </button>
                    {item.caption && <span className="caption">{item.caption}</span>}
                  </li>
                ))}
              </ul>
            )
          }
          default:
            return null // forward compatible: an unknown block never breaks a page
        }
      })}

      {lightbox && (
        <Lightbox images={lightbox.images} index={lightbox.index} onClose={() => setLightbox(null)} />
      )}
    </>
  )
}
```

```jsx
// src/public-site/components/Lightbox.jsx
import { useCallback, useEffect, useState } from 'react'

const src = (v) => (v?.path ? `/media/${v.path}` : '')

export function Lightbox({ images = [], index = 0, onClose }) {
  const [current, setCurrent] = useState(index)
  const move = useCallback(
    (delta) => setCurrent((c) => (c + delta + images.length) % images.length),
    [images.length]
  )

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move, onClose])

  const image = images[current]
  return (
    <div className="lightbox" role="dialog" aria-modal="true">
      <button type="button" className="lightbox-close" onClick={onClose} aria-label="Fermer">×</button>
      <button type="button" className="lightbox-prev" onClick={() => move(-1)} aria-label="Précédent">‹</button>
      <img src={src(image?.variants?.large || image?.variants?.medium)} alt={image?.alt || ''} />
      <button type="button" className="lightbox-next" onClick={() => move(1)} aria-label="Suivant">›</button>
    </div>
  )
}
```

Write `ArticleDetail.jsx`: fetch `/articles/:slug`, render the title, `yearLabel`, `<BlockRenderer>`, and prev/next links built with `href('works', prev.slug)`. Pass the paired slug up as `translatedPath` so the header's language toggle lands on the same article.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- BlockRenderer`
Expected: PASS, 6 tests.

- [ ] **Step 5: Commit**

```bash
git add src/public-site/components/BlockRenderer.jsx src/public-site/components/Lightbox.jsx src/public-site/pages/ArticleDetail.jsx src/public-site/components/__tests__
git commit -m "feat(web): render article blocks with gallery lightbox"
```

---

### Task 18: Homepage slideshow

**Files:**
- Create: `src/public-site/components/Slideshow.jsx`, `src/public-site/pages/Home.jsx`
- Test: `src/public-site/components/__tests__/Slideshow.test.jsx`

**Interfaces:**
- Consumes: `apiGet('/home')`, `useLang`.
- Produces: `<Slideshow slides={[]} interval={6000} />` with keyboard control, hover and focus pause, and autoplay suppressed under `prefers-reduced-motion`.

- [ ] **Step 1: Write the failing test**

```jsx
// src/public-site/components/__tests__/Slideshow.test.jsx
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../../../lib/lang.jsx'
import { Slideshow } from '../Slideshow.jsx'

const slides = [
  { caption: 'Porte', article: { slug: 'porte' }, image: { alt: 'porte', variants: { large: { path: 'a.webp', width: 2400, height: 1600 } } } },
  { caption: 'Châssis', article: { slug: 'chassis' }, image: { alt: 'chassis', variants: { large: { path: 'b.webp', width: 2400, height: 1600 } } } },
]

const mockMotion = (reduced) =>
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reduced && query.includes('reduce'),
    addEventListener: () => {}, removeEventListener: () => {},
  }))

beforeEach(() => { vi.useFakeTimers({ shouldAdvanceTime: true }); mockMotion(false) })
afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })

const renderShow = () =>
  render(<MemoryRouter><LangProvider><Slideshow slides={slides} interval={5000} /></LangProvider></MemoryRouter>)

describe('Slideshow', () => {
  it('shows the first slide initially', () => {
    renderShow()
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('advances after the interval', () => {
    renderShow()
    act(() => { vi.advanceTimersByTime(5000) })
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('advances on the right arrow key', async () => {
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
    renderShow()
    await user.keyboard('{ArrowRight}')
    expect(screen.getByAltText('chassis')).toBeInTheDocument()
  })

  it('does not autoplay when reduced motion is preferred', () => {
    mockMotion(true)
    renderShow()
    act(() => { vi.advanceTimersByTime(20000) })
    expect(screen.getByAltText('porte')).toBeInTheDocument()
  })

  it('links the current slide to its article', () => {
    renderShow()
    expect(screen.getByRole('link', { name: /porte/i })).toHaveAttribute('href', '/oeuvres/porte')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Slideshow`
Expected: FAIL, cannot resolve `../Slideshow.jsx`.

- [ ] **Step 3: Write the minimal implementation**

```jsx
// src/public-site/components/Slideshow.jsx
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useLang } from '../../lib/lang.jsx'

const src = (v) => (v?.path ? `/media/${v.path}` : '')

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    if (!mq) return undefined
    setReduced(mq.matches)
    const onChange = (e) => setReduced(e.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

export function Slideshow({ slides = [], interval = 6000 }) {
  const { href } = useLang()
  const [index, setIndex] = useState(0)
  const [paused, setPaused] = useState(false)
  const reduced = usePrefersReducedMotion()
  const count = slides.length
  const move = useCallback((delta) => setIndex((i) => (i + delta + count) % count), [count])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'ArrowRight') move(1)
      if (e.key === 'ArrowLeft') move(-1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [move])

  useEffect(() => {
    if (reduced || paused || count < 2) return undefined
    const timer = setInterval(() => move(1), interval)
    return () => clearInterval(timer)
  }, [reduced, paused, count, interval, move])

  if (!count) return null
  const slide = slides[index]
  // Defensive: the API omits imageless slides, but a manual Home override could
  // still contain one, and an <img> with no src is worse than no slide.
  if (!slide?.image?.variants?.large) return null

  return (
    <section
      className="slideshow"
      aria-roledescription="carousel"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
    >
      <img src={src(slide.image?.variants?.large)} alt={slide.image?.alt || ''} />
      {slide.article?.slug && (
        <Link to={href('works', slide.article.slug)} className="slide-caption">
          {slide.caption || slide.article.title}
        </Link>
      )}
      <div className="slideshow-controls">
        <button type="button" onClick={() => move(-1)} aria-label="Précédent">‹</button>
        <span aria-live="polite">{index + 1} / {count}</span>
        <button type="button" onClick={() => move(1)} aria-label="Suivant">›</button>
      </div>
    </section>
  )
}
```

Write `Home.jsx`: fetch `/home`, render `<Slideshow slides={data.slides} />`, then the `home` page intro blocks and a small selection grid.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- Slideshow`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add src/public-site/components/Slideshow.jsx src/public-site/pages/Home.jsx src/public-site/components/__tests__/Slideshow.test.jsx
git commit -m "feat(web): add accessible homepage slideshow"
```

---

### Task 19: Remaining public pages and app routing

**Files:**
- Create: `src/public-site/pages/{Exhibitions.jsx,SimplePage.jsx,NotFound.jsx}`
- Modify: `src/App.jsx`
- Test: `src/__tests__/App.test.jsx`

**Interfaces:**
- Consumes: every page component built so far.
- Produces: the complete route table for both languages, with a 404 fallback.

- [ ] **Step 1: Write the failing test**

```jsx
// src/__tests__/App.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { LangProvider } from '../lib/lang.jsx'
import * as api from '../lib/api.js'
import App from '../App.jsx'

beforeEach(() => {
  vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
    if (path.startsWith('/pages/')) return { key: 'biography', title: 'Biographie', blocks: [{ type: 'text', value: '<p>Né en 1964</p>' }] }
    if (path === '/home') return { slides: [] }
    return { items: [], total: 0 }
  })
})

const renderAt = (path) =>
  render(<MemoryRouter initialEntries={[path]}><LangProvider><App /></LangProvider></MemoryRouter>)

describe('App routing', () => {
  it('renders the French biography page', async () => {
    renderAt('/biographie')
    await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
  })

  it('renders the English biography page', async () => {
    renderAt('/en/biography')
    await waitFor(() => expect(screen.getByText('Né en 1964')).toBeInTheDocument())
  })

  it('renders a 404 for an unknown path', async () => {
    renderAt('/nonsense')
    await waitFor(() => expect(screen.getByRole('heading', { name: /404/ })).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- App`
Expected: FAIL, no matching routes.

- [ ] **Step 3: Write the minimal implementation**

```jsx
// src/App.jsx
import { lazy, Suspense } from 'react'
import { Routes, Route } from 'react-router-dom'
import { Header } from './public-site/components/Header.jsx'
import { Footer } from './public-site/components/Footer.jsx'
import { Home } from './public-site/pages/Home.jsx'
import { Works } from './public-site/pages/Works.jsx'
import { Exhibitions } from './public-site/pages/Exhibitions.jsx'
import { ArticleDetail } from './public-site/pages/ArticleDetail.jsx'
import { SimplePage } from './public-site/pages/SimplePage.jsx'
import { NotFound } from './public-site/pages/NotFound.jsx'
import { SEGMENTS } from './lib/routes.js'

// Admin is lazy so the public bundle never carries the editor.
const Admin = lazy(() => import('./admin/Admin.jsx'))

function localizedRoutes(lang) {
  const s = (key) => SEGMENTS[key][lang]
  return (
    <>
      <Route index element={<Home />} />
      <Route path={s('works')} element={<Works />} />
      <Route path={`${s('works')}/:slug`} element={<ArticleDetail routeKey="works" />} />
      <Route path={s('exhibitions')} element={<Exhibitions />} />
      <Route path={`${s('exhibitions')}/:slug`} element={<ArticleDetail routeKey="exhibitions" />} />
      <Route path={s('biography')} element={<SimplePage pageKey="biography" />} />
      <Route path={s('contact')} element={<SimplePage pageKey="contact" />} />
      <Route path={s('bibliography')} element={<SimplePage pageKey="bibliography" />} />
      <Route path={s('links')} element={<SimplePage pageKey="links" />} />
      <Route path={s('legal')} element={<SimplePage pageKey="legal" />} />
    </>
  )
}

export default function App() {
  return (
    <>
      <Header />
      <Routes>
        <Route path="/admin/*" element={<Suspense fallback={null}><Admin /></Suspense>} />
        <Route path="/">{localizedRoutes('fr')}</Route>
        <Route path="/en">{localizedRoutes('en')}</Route>
        <Route path="*" element={<NotFound />} />
      </Routes>
      <Footer />
    </>
  )
}
```

`SimplePage.jsx` fetches `/pages/:key` and renders the title plus `<BlockRenderer>`. `Exhibitions.jsx` is `Works.jsx` without the extra category sections and without decade grouping, sorted newest first. `NotFound.jsx` renders an `h1` containing "404" and a link home.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test`
Expected: PASS, all web tests.

- [ ] **Step 5: Commit**

```bash
git add src/App.jsx src/public-site/pages src/__tests__
git commit -m "feat(web): complete public routing for both languages"
```

---

## Phase 5: Admin, prerender and deployment

### Task 20: Admin shell, login and article list

**Files:**
- Create: `src/admin/{Admin.jsx,useAuth.js,Login.jsx,ArticleList.jsx}`, `src/admin/admin.css`
- Test: `src/admin/__tests__/{Login.test.jsx,ArticleList.test.jsx}`

**Interfaces:**
- Consumes: `apiGet`, `apiSend`.
- Produces: `useAuth()` returning `{ user, loading, login(email, password), logout() }`; `<Admin />` mounting the admin routes and showing `<Login />` whenever `user` is null.

- [ ] **Step 1: Write the failing test**

```jsx
// src/admin/__tests__/Login.test.jsx
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import * as api from '../../lib/api.js'
import Admin from '../Admin.jsx'

beforeEach(() => vi.restoreAllMocks())

describe('Admin login', () => {
  it('shows the login form when not authenticated', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    render(<MemoryRouter initialEntries={['/admin']}><Admin /></MemoryRouter>)
    await waitFor(() => expect(screen.getByLabelText(/mot de passe/i)).toBeInTheDocument())
  })

  it('shows an error message on a failed login', async () => {
    vi.spyOn(api, 'apiGet').mockRejectedValue(Object.assign(new Error('nope'), { status: 401 }))
    vi.spyOn(api, 'apiSend').mockRejectedValue(Object.assign(new Error('bad'), { status: 401 }))
    render(<MemoryRouter initialEntries={['/admin']}><Admin /></MemoryRouter>)
    await waitFor(() => screen.getByLabelText(/mot de passe/i))
    await userEvent.type(screen.getByLabelText(/courriel/i), 'admin@example.com')
    await userEvent.type(screen.getByLabelText(/mot de passe/i), 'wrong')
    await userEvent.click(screen.getByRole('button', { name: /connexion/i }))
    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument())
  })

  it('shows the article list once authenticated', async () => {
    vi.spyOn(api, 'apiGet').mockImplementation(async (path) => {
      if (path === '/auth/me') return { email: 'admin@example.com' }
      if (path === '/admin/articles') return { items: [{ _id: '1', title: { fr: 'Porte', en: '' }, category: 'works', status: 'published', slug: { fr: 'porte' } }], total: 1 }
      return { items: [] }
    })
    render(<MemoryRouter initialEntries={['/admin']}><Admin /></MemoryRouter>)
    await waitFor(() => expect(screen.getByText('Porte')).toBeInTheDocument())
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npm test -- Login`
Expected: FAIL, cannot resolve `../Admin.jsx`.

- [ ] **Step 3: Write the minimal implementation**

```js
// src/admin/useAuth.js
import { useCallback, useEffect, useState } from 'react'
import { apiGet, apiSend } from '../lib/api.js'

export function useAuth() {
  const [user, setUser] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    apiGet('/auth/me')
      .then(setUser)
      .catch(() => setUser(null))
      .finally(() => setLoading(false))
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
```

```jsx
// src/admin/Login.jsx
import { useState } from 'react'

export function Login({ onLogin }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  async function submit(e) {
    e.preventDefault()
    setError('')
    try {
      await onLogin(email, password)
    } catch {
      setError('Identifiants invalides')
    }
  }

  return (
    <form className="admin-login" onSubmit={submit}>
      <h1>Administration</h1>
      <label htmlFor="email">Courriel</label>
      <input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
      <label htmlFor="password">Mot de passe</label>
      <input id="password" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      {error && <p role="alert">{error}</p>}
      <button type="submit">Connexion</button>
    </form>
  )
}
```

```jsx
// src/admin/Admin.jsx
import { Routes, Route, Link } from 'react-router-dom'
import { useAuth } from './useAuth.js'
import { Login } from './Login.jsx'
import { ArticleList } from './ArticleList.jsx'
import { ArticleEditor } from './ArticleEditor.jsx'
import { MediaLibrary } from './MediaLibrary.jsx'
import { PageEditor } from './PageEditor.jsx'
import './admin.css'

export default function Admin() {
  const { user, loading, login, logout } = useAuth()
  if (loading) return null
  if (!user) return <Login onLogin={login} />

  return (
    <div className="admin">
      <nav className="admin-nav">
        <Link to="/admin">Articles</Link>
        <Link to="/admin/media">Images</Link>
        <Link to="/admin/pages/biography">Pages</Link>
        <button type="button" onClick={logout}>Déconnexion</button>
      </nav>
      <Routes>
        <Route index element={<ArticleList />} />
        <Route path="articles/new" element={<ArticleEditor />} />
        <Route path="articles/:id" element={<ArticleEditor />} />
        <Route path="media" element={<MediaLibrary />} />
        <Route path="pages/:key" element={<PageEditor />} />
      </Routes>
    </div>
  )
}
```

Ordering note: `Admin.jsx` imports `ArticleEditor`, `MediaLibrary` and
`PageEditor`, which Task 21 creates. Stub each one now so the router
resolves, and let Task 21 replace them:

```jsx
// e.g. src/admin/ArticleEditor.jsx (stub, replaced in Task 21)
export function ArticleEditor() { return null }
```

`ArticleList.jsx` fetches `/admin/articles`, groups by category, renders `article.title.fr` with a status badge, a link to `/admin/articles/:id`, a publish toggle calling `apiSend('PATCH', ...)`, and drag handles that call `apiSend('POST', '/admin/articles/reorder', { ids })` on drop.

- [ ] **Step 4: Run the test to verify it passes**

Run: `npm test -- Login`
Expected: PASS, 3 tests.

- [ ] **Step 5: Commit**

```bash
git add src/admin
git commit -m "feat(admin): add authentication shell and article list"
```

---

### Task 21: Article editor with language toggle and block editing

The piece the site owner uses daily. The language toggle semantics are the part worth testing hardest.

**Files:**
- Create: `src/admin/{ArticleEditor.jsx,LocalizedInput.jsx,BlockEditor.jsx,RichText.jsx,ImagePicker.jsx,MediaLibrary.jsx,PageEditor.jsx}`
- Test: `src/admin/__tests__/LocalizedInput.test.jsx`, `src/admin/__tests__/BlockEditor.test.jsx`

**Interfaces:**
- Consumes: `apiGet`, `apiSend`, `apiUpload`.
- Produces:
  - `<LocalizedInput value={{fr,en}} lang="en" onChange={fn} label="Titre" />` where editing `en` shows the FR value as placeholder and offers a revert control.
  - `<BlockEditor blocks={[]} lang onChange={fn} />` supporting add, delete, move up/down for all five block types.
  - `<RichText value onChange />` wrapping TipTap with a restricted toolbar.

- [ ] **Step 1: Write the failing test**

```jsx
// src/admin/__tests__/LocalizedInput.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LocalizedInput } from '../LocalizedInput.jsx'

describe('LocalizedInput', () => {
  it('edits the French base directly', async () => {
    const onChange = vi.fn()
    render(<LocalizedInput label="Titre" lang="fr" value={{ fr: 'Porte', en: '' }} onChange={onChange} />)
    expect(screen.getByLabelText('Titre')).toHaveValue('Porte')
    await userEvent.type(screen.getByLabelText('Titre'), '!')
    expect(onChange).toHaveBeenLastCalledWith({ fr: 'Porte!', en: '' })
  })

  it('shows the French value as placeholder when editing English with no override', () => {
    render(<LocalizedInput label="Titre" lang="en" value={{ fr: 'Porte', en: '' }} onChange={() => {}} />)
    const input = screen.getByLabelText('Titre')
    expect(input).toHaveValue('')
    expect(input).toHaveAttribute('placeholder', 'Porte')
  })

  it('marks the field as overridden once English differs', () => {
    render(<LocalizedInput label="Titre" lang="en" value={{ fr: 'Porte', en: 'Door' }} onChange={() => {}} />)
    expect(screen.getByLabelText('Titre')).toHaveValue('Door')
    expect(screen.getByRole('button', { name: /français/i })).toBeInTheDocument()
  })

  it('clears the English override when reverting', async () => {
    const onChange = vi.fn()
    render(<LocalizedInput label="Titre" lang="en" value={{ fr: 'Porte', en: 'Door' }} onChange={onChange} />)
    await userEvent.click(screen.getByRole('button', { name: /français/i }))
    expect(onChange).toHaveBeenCalledWith({ fr: 'Porte', en: '' })
  })

  it('offers no revert control while editing French', () => {
    render(<LocalizedInput label="Titre" lang="fr" value={{ fr: 'Porte', en: 'Door' }} onChange={() => {}} />)
    expect(screen.queryByRole('button', { name: /français/i })).not.toBeInTheDocument()
  })
})
```

```jsx
// src/admin/__tests__/BlockEditor.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { BlockEditor } from '../BlockEditor.jsx'

const blocks = [
  { type: 'heading', value: { fr: 'Un', en: '' }, level: 2 },
  { type: 'specs', items: [{ term: { fr: 'Tirage', en: '' }, value: { fr: '3', en: '' } }] },
]

describe('BlockEditor', () => {
  it('renders one editor per block', () => {
    render(<BlockEditor blocks={blocks} lang="fr" onChange={() => {}} />)
    expect(screen.getAllByTestId('block')).toHaveLength(2)
  })

  it('appends a block of the chosen type', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    await userEvent.selectOptions(screen.getByLabelText(/ajouter/i), 'text')
    expect(onChange).toHaveBeenLastCalledWith([...blocks, { type: 'text', value: { fr: '', en: '' } }])
  })

  it('moves a block up', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button', { name: /monter/i })[1])
    expect(onChange).toHaveBeenLastCalledWith([blocks[1], blocks[0]])
  })

  it('deletes a block', async () => {
    const onChange = vi.fn()
    render(<BlockEditor blocks={blocks} lang="fr" onChange={onChange} />)
    await userEvent.click(screen.getAllByRole('button', { name: /supprimer/i })[0])
    expect(onChange).toHaveBeenLastCalledWith([blocks[1]])
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- LocalizedInput BlockEditor`
Expected: FAIL, cannot resolve the new modules.

- [ ] **Step 3: Write the minimal implementation**

Add `@tiptap/react` (`^2.6.6`), `@tiptap/starter-kit` (`^2.6.6`), `@tiptap/extension-link` (`^2.6.6`) to the root `package.json`.

```jsx
// src/admin/LocalizedInput.jsx
import { useId } from 'react'

/**
 * French is the base value. English is an override: empty means "fall back to
 * French", which is exactly what the reader sees, so the placeholder shows the
 * French text rather than inventing a copy of it.
 */
export function LocalizedInput({ label, lang, value = { fr: '', en: '' }, onChange, multiline = false }) {
  const id = useId()
  const isOverride = lang === 'en'
  const current = value[lang] || ''
  const Tag = multiline ? 'textarea' : 'input'

  return (
    <div className={`localized-input${isOverride && current ? ' is-overridden' : ''}`}>
      <label htmlFor={id}>{label}</label>
      <Tag
        id={id}
        value={current}
        placeholder={isOverride ? value.fr || '' : ''}
        onChange={(e) => onChange({ ...value, [lang]: e.target.value })}
      />
      {isOverride && current && (
        <button type="button" onClick={() => onChange({ ...value, en: '' })}>
          Revenir au français
        </button>
      )}
    </div>
  )
}
```

```jsx
// src/admin/BlockEditor.jsx
import { LocalizedInput } from './LocalizedInput.jsx'
import { RichText } from './RichText.jsx'
import { ImagePicker } from './ImagePicker.jsx'

const EMPTY = {
  text: { type: 'text', value: { fr: '', en: '' } },
  heading: { type: 'heading', value: { fr: '', en: '' }, level: 2 },
  image: { type: 'image', image: null, caption: { fr: '', en: '' }, size: 'wide' },
  gallery: { type: 'gallery', columns: 3, items: [] },
  specs: { type: 'specs', items: [] },
}

const LABELS = { text: 'Texte', heading: 'Titre', image: 'Image', gallery: 'Galerie', specs: 'Caractéristiques' }

export function BlockEditor({ blocks = [], lang, onChange }) {
  const replace = (i, block) => onChange(blocks.map((b, j) => (j === i ? block : b)))
  const move = (i, delta) => {
    const next = [...blocks]
    const [item] = next.splice(i, 1)
    next.splice(i + delta, 0, item)
    onChange(next)
  }

  return (
    <div className="block-editor">
      {blocks.map((block, i) => (
        <fieldset key={i} data-testid="block">
          <legend>{LABELS[block.type] || block.type}</legend>

          {block.type === 'text' && (
            <RichText value={block.value[lang] || ''} onChange={(html) => replace(i, { ...block, value: { ...block.value, [lang]: html } })} />
          )}

          {block.type === 'heading' && (
            <LocalizedInput label="Titre" lang={lang} value={block.value} onChange={(value) => replace(i, { ...block, value })} />
          )}

          {block.type === 'image' && (
            <>
              <ImagePicker value={block.image} onChange={(image) => replace(i, { ...block, image })} />
              <LocalizedInput label="Légende" lang={lang} value={block.caption} onChange={(caption) => replace(i, { ...block, caption })} />
            </>
          )}

          {block.type === 'gallery' && (
            <>
              <ImagePicker
                multiple
                value={block.items.map((it) => it.image)}
                onChange={(images) =>
                  replace(i, {
                    ...block,
                    // Preserve each existing item's span when the selection changes.
                    items: images.map((image) => {
                      const existing = block.items.find((it) => it.image?._id === image?._id)
                      return existing || { image, caption: { fr: '', en: '' }, span: 1 }
                    }),
                  })
                }
              />
              <div className="gallery-columns">
                <label htmlFor={`columns-${i}`}>Colonnes</label>
                <select
                  id={`columns-${i}`}
                  value={block.columns || 3}
                  onChange={(e) => replace(i, { ...block, columns: Number(e.target.value) })}
                >
                  {[1, 2, 3, 4, 5, 6].map((n) => (
                    <option key={n} value={n}>{n}</option>
                  ))}
                </select>
              </div>
              <ul className="gallery-spans">
                {block.items.map((item, j) => (
                  <li key={j}>
                    <label htmlFor={`span-${i}-${j}`}>Largeur</label>
                    <select
                      id={`span-${i}-${j}`}
                      value={Math.min(item.span || 1, block.columns || 3)}
                      onChange={(e) => replace(i, { ...block, items: block.items.map((it, k) => (k === j ? { ...it, span: Number(e.target.value) } : it)) })}
                    >
                      {/* Never offer a span wider than the gallery itself. */}
                      {Array.from({ length: block.columns || 3 }, (_, n) => n + 1).map((n) => (
                        <option key={n} value={n}>{n === 1 ? '1 colonne' : `${n} colonnes`}</option>
                      ))}
                    </select>
                  </li>
                ))}
              </ul>
            </>
          )}

          {block.type === 'specs' && (
            <div className="specs-editor">
              {block.items.map((item, j) => (
                <div key={j}>
                  <LocalizedInput label="Terme" lang={lang} value={item.term} onChange={(term) => replace(i, { ...block, items: block.items.map((it, k) => (k === j ? { ...it, term } : it)) })} />
                  <LocalizedInput label="Valeur" lang={lang} value={item.value} onChange={(value) => replace(i, { ...block, items: block.items.map((it, k) => (k === j ? { ...it, value } : it)) })} />
                </div>
              ))}
              <button type="button" onClick={() => replace(i, { ...block, items: [...block.items, { term: { fr: '', en: '' }, value: { fr: '', en: '' } }] })}>
                Ajouter une ligne
              </button>
            </div>
          )}

          <div className="block-actions">
            <button type="button" disabled={i === 0} onClick={() => move(i, -1)}>Monter</button>
            <button type="button" disabled={i === blocks.length - 1} onClick={() => move(i, 1)}>Descendre</button>
            <button type="button" onClick={() => onChange(blocks.filter((_, j) => j !== i))}>Supprimer</button>
          </div>
        </fieldset>
      ))}

      <label htmlFor="add-block">Ajouter un bloc</label>
      <select id="add-block" value="" onChange={(e) => e.target.value && onChange([...blocks, structuredClone(EMPTY[e.target.value])])}>
        <option value="">…</option>
        {Object.keys(EMPTY).map((type) => (
          <option key={type} value={type}>{LABELS[type]}</option>
        ))}
      </select>
    </div>
  )
}
```

`RichText.jsx` wraps TipTap with `StarterKit` configured to allow only bold, italic, bullet and ordered lists, blockquote and link, and calls `onChange(editor.getHTML())`. `ImagePicker.jsx` lists `/admin/images`, uploads through `apiUpload('/admin/images', file)`, and returns the chosen image objects. `ArticleEditor.jsx` composes `LocalizedInput` for title, yearLabel and slug, a category select, an `ImagePicker` for the cover, `BlockEditor` for the body, an FR/EN toggle driving the `lang` prop, and a save button calling `apiSend('POST'|'PATCH', ...)`. `PageEditor.jsx` reuses the same pieces.

`ArticleEditor.jsx` also carries the "en avant" toggle, the second of the two
sizing settings:

```jsx
<label htmlFor="featured">
  <input
    id="featured"
    type="checkbox"
    checked={Boolean(article.featured)}
    onChange={(e) => setArticle({ ...article, featured: e.target.checked })}
  />
  En avant (diaporama d'accueil et grande vignette)
</label>
```

The label names both effects, because one toggle doing two things is only
confusing if the interface hides the second. There is no separate slideshow
screen: the slideshow is exactly the set of works with this box ticked.

When "en avant" is ticked on a work that has no cover image, the editor shows an
inline warning next to the checkbox: the slideshow needs an image, so such a work
is skipped. Without this the omission is silent and the editor is left wondering
why their choice had no effect.

```jsx
{article.featured && !article.cover && (
  <p role="alert" className="field-warning">
    Cette œuvre n'a pas d'image principale : elle n'apparaîtra pas dans le diaporama.
  </p>
)}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- LocalizedInput BlockEditor`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json src/admin
git commit -m "feat(admin): add article editor with language override and block editing"
```

---

### Task 22: Prerender, sitemap and metadata

**Files:**
- Create: `src/lib/preload.jsx`, `src/entry-server.jsx`, `prerender/index.js`
- Modify: `src/public-site/pages/{Home,Works,Exhibitions,ArticleDetail,SimplePage}.jsx` to use `usePageData`
- Modify: `src/main.jsx` (hydrate when prerendered markup is present)
- Test: `src/lib/__tests__/preload.test.jsx`, `prerender/__tests__/routes.test.js`

**Interfaces:**
- Consumes: the public API, the built client bundle.
- Produces:
  - `PreloadProvider` and `usePageData(key, fetcher)` from `lib/preload.jsx`: returns preloaded data when present, otherwise fetches on mount.
  - `render(url, preload)` from `entry-server.jsx` returning `{ html }`.
  - `collectRoutes(content)` and `headFor(route, content, site)` from
    `prerender/index.js`, the latter returning the `<head>` tags for one route.

- [ ] **Step 1: Write the failing test**

```jsx
// src/lib/__tests__/preload.test.jsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { PreloadProvider, usePageData } from '../preload.jsx'

function Probe() {
  const { data } = usePageData('page:biography', async () => ({ title: 'fetched' }))
  return <span>{data ? data.title : 'loading'}</span>
}

describe('usePageData', () => {
  it('uses preloaded data without fetching', async () => {
    const fetcher = vi.fn()
    render(
      <PreloadProvider value={{ 'page:biography': { title: 'preloaded' } }}><Probe /></PreloadProvider>
    )
    expect(screen.getByText('preloaded')).toBeInTheDocument()
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('fetches when nothing is preloaded', async () => {
    render(<PreloadProvider value={{}}><Probe /></PreloadProvider>)
    await waitFor(() => expect(screen.getByText('fetched')).toBeInTheDocument())
  })
})
```

```js
// prerender/__tests__/routes.test.js
import { describe, it, expect } from 'vitest'
import { collectRoutes } from '../index.js'

describe('collectRoutes', () => {
  it('emits both languages for every static page and article', () => {
    const routes = collectRoutes({
      articles: [{ category: 'works', slug: { fr: 'porte', en: 'door' } }],
      pageKeys: ['biography'],
    })
    expect(routes).toContain('/')
    expect(routes).toContain('/en')
    expect(routes).toContain('/oeuvres/porte')
    expect(routes).toContain('/en/works/door')
    expect(routes).toContain('/biographie')
    expect(routes).toContain('/en/biography')
  })

  it('skips the English article route when there is no English slug', () => {
    const routes = collectRoutes({ articles: [{ category: 'works', slug: { fr: 'nouveau-2024', en: '' } }], pageKeys: [] })
    expect(routes).toContain('/oeuvres/nouveau-2024')
    expect(routes.filter((r) => r.startsWith('/en/works/'))).toEqual([])
  })
})

describe('headFor', () => {
  const content = {
    articles: [{
      category: 'works',
      slug: { fr: 'porte', en: 'door' },
      title: { fr: 'Porte', en: '' },
      yearLabel: { fr: '2023', en: '' },
      cover: { variants: { medium: { path: '2023/abc-medium.webp' } } },
    }],
  }
  const site = 'https://example.org'

  it('titles an article page with its title and year', () => {
    expect(headFor('/oeuvres/porte', content, site)).toContain('<title>Porte, 2023 | Philippe Gronon</title>')
  })

  it('falls back to the French title on the English route', () => {
    expect(headFor('/en/works/door', content, site)).toContain('<title>Porte, 2023 | Philippe Gronon</title>')
  })

  it('emits a canonical URL and both hreflang alternates', () => {
    const head = headFor('/oeuvres/porte', content, site)
    expect(head).toContain('<link rel="canonical" href="https://example.org/oeuvres/porte">')
    expect(head).toContain('hreflang="fr" href="https://example.org/oeuvres/porte"')
    expect(head).toContain('hreflang="en" href="https://example.org/en/works/door"')
  })

  it('emits an Open Graph image pointing at the cover', () => {
    expect(headFor('/oeuvres/porte', content, site)).toContain('content="https://example.org/media/2023/abc-medium.webp"')
  })

  it('titles a non-article route without crashing', () => {
    expect(headFor('/biographie', content, site)).toContain('<title>Philippe Gronon</title>')
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test -- preload prerender`
Expected: FAIL, cannot resolve the new modules.

- [ ] **Step 3: Write the minimal implementation**

```jsx
// src/lib/preload.jsx
import { createContext, useContext, useEffect, useState } from 'react'

const PreloadContext = createContext({})

export function PreloadProvider({ value, children }) {
  return <PreloadContext.Provider value={value || {}}>{children}</PreloadContext.Provider>
}

/**
 * During prerender (and on first paint after hydration) the data is already
 * present, so no request is made and the markup contains real content. On any
 * later client navigation it falls back to fetching.
 */
export function usePageData(key, fetcher) {
  const preloaded = useContext(PreloadContext)
  const [data, setData] = useState(preloaded[key] ?? null)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (preloaded[key] !== undefined) { setData(preloaded[key]); return undefined }
    let cancelled = false
    setData(null)
    fetcher()
      .then((result) => { if (!cancelled) setData(result) })
      .catch((err) => { if (!cancelled) setError(err) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  return { data, error, loading: !data && !error }
}
```

Refactor each page to use it, for example in `SimplePage.jsx`:

```jsx
const { data } = usePageData(`page:${pageKey}:${lang}`, () => apiGet(`/pages/${pageKey}`, { lang }))
```

and in `Works.jsx` replace the `useEffect` with:

```jsx
const { data } = usePageData(`works:${lang}`, async () => {
  const [works, editions, orders, intro] = await Promise.all([
    apiGet('/articles', { category: 'works', lang }),
    apiGet('/articles', { category: 'editions', lang }),
    apiGet('/articles', { category: 'public-orders', lang }),
    apiGet('/pages/works', { lang }),
  ])
  return { works: works.items, editions: editions.items, 'public-orders': orders.items, intro }
})
const state = data || { works: [], editions: [], 'public-orders': [], intro: null }
```

```jsx
// src/entry-server.jsx
import { renderToString } from 'react-dom/server'
import { StaticRouter } from 'react-router-dom/server'
import App from './App.jsx'
import { LangProvider } from './lib/lang.jsx'
import { PreloadProvider } from './lib/preload.jsx'

export function render(url, preload) {
  return {
    html: renderToString(
      <StaticRouter location={url}>
        <PreloadProvider value={preload}>
          <LangProvider><App /></LangProvider>
        </PreloadProvider>
      </StaticRouter>
    ),
  }
}
```

```js
// prerender/index.js
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { SEGMENTS } from '../src/lib/routes.js'

const API = process.env.PRERENDER_API_URL || 'http://localhost:8080/api'
const SITE = process.env.SITE_URL || 'https://philippe.natazar.org'
const DIST = 'dist'

export function collectRoutes({ articles, pageKeys }) {
  const routes = ['/', '/en']
  for (const key of pageKeys) {
    routes.push(`/${SEGMENTS[key].fr}`, `/en/${SEGMENTS[key].en}`)
  }
  for (const a of articles) {
    const section = a.category === 'exhibitions' ? 'exhibitions' : 'works'
    if (a.slug?.fr) routes.push(`/${SEGMENTS[section].fr}/${a.slug.fr}`)
    if (a.slug?.en) routes.push(`/en/${SEGMENTS[section].en}/${a.slug.en}`)
  }
  return [...new Set(routes)]
}

const SITE_NAME = 'Philippe Gronon'
const esc = (s) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

/** Builds the per-route head tags: title, description, canonical, hreflang, OG. */
export function headFor(route, content, site = SITE) {
  const match = (content.articles || []).find(
    (a) => route.endsWith(`/${a.slug?.fr}`) || (a.slug?.en && route.endsWith(`/${a.slug.en}`))
  )

  const tags = []
  if (match) {
    const title = match.title?.fr || match.title || ''
    const year = match.yearLabel?.fr || match.yearLabel || ''
    tags.push(`<title>${esc(year ? `${title}, ${year}` : title)} | ${SITE_NAME}</title>`)
    const section = match.category === 'exhibitions' ? 'exhibitions' : 'works'
    if (match.slug?.fr) {
      const fr = `${site}/${SEGMENTS[section].fr}/${match.slug.fr}`
      tags.push(`<link rel="alternate" hreflang="fr" href="${fr}">`)
    }
    if (match.slug?.en) {
      const en = `${site}/en/${SEGMENTS[section].en}/${match.slug.en}`
      tags.push(`<link rel="alternate" hreflang="en" href="${en}">`)
    }
    const cover = match.cover?.variants?.medium?.path
    if (cover) tags.push(`<meta property="og:image" content="${site}/media/${cover}">`)
  } else {
    tags.push(`<title>${SITE_NAME}</title>`)
  }

  tags.push(`<link rel="canonical" href="${site}${route}">`)
  tags.push(`<meta property="og:site_name" content="${SITE_NAME}">`)
  tags.push(`<meta property="og:url" content="${site}${route}">`)
  return tags.join('\n')
}

async function fetchJson(path) {
  const res = await fetch(`${API}${path}`)
  if (!res.ok) throw new Error(`${path} -> ${res.status}`)
  return res.json()
}

async function main() {
  const template = await readFile(join(DIST, 'index.html'), 'utf8')

  let content
  try {
    const [works, exhibitions, editions, orders] = await Promise.all([
      fetchJson('/articles?category=works'),
      fetchJson('/articles?category=exhibitions'),
      fetchJson('/articles?category=editions'),
      fetchJson('/articles?category=public-orders'),
    ])
    content = { articles: [...works.items, ...exhibitions.items, ...editions.items, ...orders.items] }
  } catch (err) {
    // A missing API must not break the deploy: ship the SPA shell and move on.
    console.warn(`prerender skipped, API unreachable at ${API}: ${err.message}`)
    return
  }

  const { render } = await import('../dist-server/entry-server.js')
  const pageKeys = ['works', 'exhibitions', 'biography', 'contact', 'bibliography', 'links', 'legal']
  const routes = collectRoutes({ articles: content.articles, pageKeys })

  for (const route of routes) {
    const { html } = render(route, {})
    const page = template
      .replace('</head>', `${headFor(route, content)}\n</head>`)
      .replace('<div id="root"></div>', `<div id="root">${html}</div>`)
    const out = join(DIST, route === '/' ? 'index.html' : `${route.replace(/^\//, '')}/index.html`)
    await mkdir(dirname(out), { recursive: true })
    await writeFile(out, page)
  }

  const urls = routes.map((r) => `  <url><loc>${SITE}${r}</loc></url>`).join('\n')
  await writeFile(join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  await writeFile(join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\nDisallow: /admin\nSitemap: ${SITE}/sitemap.xml\n`)
  console.log(`prerendered ${routes.length} routes`)
}

if (import.meta.url === `file://${process.argv[1]}`) main()
```

The `index.html` template must not carry its own `<title>`, or every page would
end up with two. Keep the title out of the template and let `headFor` supply it.

Note: prerendering renders the shell and route chrome, and the client fetches
content on hydration. Passing per-route preload data into `render()` is a
worthwhile follow-up, but the routes, titles and navigation being real HTML is
what fixes the crawler problem now.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm test -- preload prerender`
Expected: PASS, 9 tests.

- [ ] **Step 5: Commit**

```bash
git add src/lib/preload.jsx src/entry-server.jsx prerender src/public-site/pages src/main.jsx
git commit -m "feat(web): prerender routes with sitemap and robots"
```

---

### Task 23: Containers, manifests and CI

**Files:**
- Create: `Dockerfile`, `nginx.conf`, `api/Dockerfile`, `.dockerignore`
- Create: `k8s/{api.yaml,web.yaml}`
- Create: `.github/workflows/{deploy-api.yml,deploy-web.yml}`

**Interfaces:**
- Consumes: everything built so far.
- Produces: two images and the cluster resources. Deployment order matters: the API deploys first so the web build's prerender can read it.

- [ ] **Step 1: Write the API container and manifest**

```dockerfile
# api/Dockerfile
FROM node:24.19-alpine AS build
WORKDIR /app
COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev
COPY api/src ./src

FROM node:24.19-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 8080
CMD ["node", "src/server.js"]
```

```yaml
# k8s/api.yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: philippe-api-config
  namespace: apps
data:
  MONGO_DB: "philippe"
  MEDIA_ROOT: "/data/media"
  ALLOWED_ORIGINS: "https://philippe.natazar.org"
  PORT: "8080"
---
# Media lives on a node-local ReadWriteOnce volume, so this deployment must
# stay at one replica and must not run two pods at once during a rollout.
apiVersion: v1
kind: PersistentVolumeClaim
metadata:
  name: philippe-media
  namespace: apps
spec:
  accessModes: ["ReadWriteOnce"]
  storageClassName: local-path
  resources:
    requests:
      storage: 20Gi
---
# Secrets are created out of band:
#   kubectl -n apps create secret generic philippe-api-secrets \
#     --from-literal=MONGO_URI='mongodb://<user>:<pass>@mongo.infra.svc.cluster.local:27017/?authSource=admin' \
#     --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
#     --from-literal=ADMIN_EMAIL='...' --from-literal=ADMIN_PASSWORD='...'
apiVersion: apps/v1
kind: Deployment
metadata:
  name: philippe-api
  namespace: apps
  labels: { app: philippe-api }
spec:
  replicas: 1
  strategy:
    type: Recreate
  selector:
    matchLabels: { app: philippe-api }
  template:
    metadata:
      labels: { app: philippe-api }
    spec:
      imagePullSecrets:
        - name: ghcr-creds
      containers:
        - name: philippe-api
          image: ghcr.io/goobernetics/philippe-api:latest
          ports: [{ containerPort: 8080 }]
          envFrom:
            - configMapRef: { name: philippe-api-config }
            - secretRef: { name: philippe-api-secrets }
          volumeMounts:
            - name: media
              mountPath: /data/media
          resources:
            requests: { cpu: 50m, memory: 128Mi }
            limits: { cpu: 500m, memory: 512Mi }
          startupProbe:
            httpGet: { path: /health, port: 8080 }
            periodSeconds: 5
            failureThreshold: 24
          livenessProbe:
            httpGet: { path: /health, port: 8080 }
            periodSeconds: 60
            failureThreshold: 3
      volumes:
        - name: media
          persistentVolumeClaim:
            claimName: philippe-media
---
apiVersion: v1
kind: Service
metadata:
  name: philippe-api
  namespace: apps
  labels: { app: philippe-api }
spec:
  type: ClusterIP
  selector: { app: philippe-api }
  ports:
    - port: 80
      targetPort: 8080
      protocol: TCP
```

- [ ] **Step 2: Write the web container and manifest**

```dockerfile
# Dockerfile (web)
FROM node:24.19-alpine AS build
WORKDIR /app
ARG PRERENDER_API_URL
ARG SITE_URL=https://philippe.natazar.org
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
COPY prerender ./prerender
RUN npm run build \
 && npx vite build --ssr src/entry-server.jsx --outDir dist-server \
 && PRERENDER_API_URL=$PRERENDER_API_URL SITE_URL=$SITE_URL npm run prerender

FROM nginx:1.27-alpine AS runtime
COPY nginx.conf /etc/nginx/nginx.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 8080
```

```
# nginx.conf: serve prerendered HTML where it exists, fall back to the SPA.
events {}
http {
  include /etc/nginx/mime.types;
  sendfile on;
  server {
    listen 8080;
    root /usr/share/nginx/html;
    location /assets/ {
      expires 1y;
      add_header Cache-Control "public, immutable";
    }
    location / {
      try_files $uri $uri/index.html /index.html;
    }
  }
}
```

`k8s/web.yaml` mirrors `api.yaml` for a stateless deployment (no volume, `replicas: 1`, readiness and liveness probes on `/`), plus the ingress:

```yaml
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: philippe
  namespace: apps
spec:
  ingressClassName: traefik
  rules:
    - host: philippe.natazar.org
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend: { service: { name: philippe-api, port: { number: 80 } } }
          - path: /media
            pathType: Prefix
            backend: { service: { name: philippe-api, port: { number: 80 } } }
          - path: /
            pathType: Prefix
            backend: { service: { name: philippe-web, port: { number: 80 } } }
```

- [ ] **Step 3: Write the workflows**

Copy the structure of `/Users/b/git/wedding/.github/workflows/deploy-api.yml`, changing `IMAGE_NAME` to `${{ github.repository_owner }}/philippe-api` and the rollout target to `deployment/philippe-api`. The web workflow builds with `--build-arg PRERENDER_API_URL=https://philippe.natazar.org/api` and triggers on pushes touching `src/**`, `prerender/**`, `Dockerfile`, `nginx.conf` or `k8s/web.yaml`. Both run their package's test suite before building, so a red test never reaches the cluster.

- [ ] **Step 4: Verify the images build locally**

```bash
docker build -f api/Dockerfile -t philippe-api:test .
docker build -f Dockerfile --build-arg PRERENDER_API_URL=http://unreachable/api -t philippe-web:test .
```

Expected: both succeed. The web build logs `prerender skipped, API unreachable`, which is the intended degradation.

- [ ] **Step 5: Commit**

```bash
git add Dockerfile nginx.conf api/Dockerfile .dockerignore k8s .github
git commit -m "chore: add containers, k8s manifests and deploy workflows"
```

---

### Task 24: Deploy and migrate to the cluster

**Files:**
- Create: `docs/runbook.md`

- [ ] **Step 1: Create the secret and apply the manifests**

```bash
kubectl --context dadonew -n apps create secret generic philippe-api-secrets \
  --from-literal=MONGO_URI="$(kubectl --context dadonew -n apps get secret wedding-api-secrets -o jsonpath='{.data.MONGO_URI}' | base64 -d)" \
  --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
  --from-literal=ADMIN_EMAIL='<owner email>' \
  --from-literal=ADMIN_PASSWORD="$(openssl rand -base64 24)"

kubectl --context dadonew apply -f k8s/api.yaml -f k8s/web.yaml
kubectl --context dadonew -n apps rollout status deployment/philippe-api
```

Note: reusing the Mongo URI from `wedding-api-secrets` avoids inventing
credentials. Confirm it points at `mongo.infra.svc.cluster.local` first, and
record the generated admin password in a password manager: it is shown once.

- [ ] **Step 2: Run the migration against the cluster**

```bash
kubectl --context dadonew -n apps port-forward deployment/philippe-api 8080:8080 &
kubectl --context dadonew -n infra port-forward deployment/mongo 27019:27017 &

cd migrate
MONGO_URI='mongodb://<user>:<pass>@127.0.0.1:27019/?authSource=admin' \
UPLOADS_ROOT=./uploads MEDIA_ROOT=/tmp/philippe-media npm run load
```

Media must land on the PVC rather than locally, so copy it in afterwards:

```bash
POD=$(kubectl --context dadonew -n apps get pod -l app=philippe-api -o name | head -1)
kubectl --context dadonew -n apps cp /tmp/philippe-media "${POD#pod/}:/data/" 
```

- [ ] **Step 3: Verify against the cluster**

```bash
cd migrate && MONGO_URI='mongodb://<user>:<pass>@127.0.0.1:27019/?authSource=admin' MEDIA_ROOT=/tmp/philippe-media npm run verify
curl -s https://philippe.natazar.org/api/articles?category=works | head -c 400
curl -s -o /dev/null -w '%{http_code}\n' https://philippe.natazar.org/
```

Expected: verify exits 0 reporting 63 articles, the API returns works, and the site returns 200.

- [ ] **Step 4: Re-run the web deploy so the prerender picks up real content**

The first web build ran before any content existed. Re-run the web workflow (or
push an empty commit touching `src/`) and confirm the log reports
`prerendered <n> routes` rather than the skip warning.

- [ ] **Step 5: Write the runbook and commit**

`docs/runbook.md` records: how to deploy, how to rotate the admin password, how to re-run the migration idempotently, where media lives and how to back up the PVC, and the DNS cutover steps for moving `philippegronon.com` (change the ingress host, add a `www` rule, point the A record at 135.148.100.142) once the migration is signed off.

```bash
git add docs/runbook.md
git commit -m "docs: add deployment and migration runbook"
```

---

## Appendix: Deferred work

Recorded so it is not silently lost:

- WooCommerce (9 products, 41 product variations) is not migrated. The current site has a shop; this build has none.
- Revolution Slider content is not migrated; the homepage slideshow is rebuilt from work covers.
- The 24 `.doc`, 8 `.docx`, 8 `.pdf` and 2 `.zip` attachments are migrated only if `verify.js` reports article bodies linking to them.
- The `Home` model retains a manual `slides` override the public API still honours, but no admin screen writes it now that the slideshow is driven by `featured`. Either wire a curation screen later or delete the model; it is currently an unused escape hatch.
- Per-route preload data in the prerender (Task 22 renders chrome and head tags, not article bodies).
- The spec listed `GET /api/sitemap.xml`. The plan does not build it: the prerender reads the existing `/api/articles` endpoints and writes `dist/sitemap.xml` directly, so a second endpoint would be dead code.
- DNS cutover to `philippegronon.com`, which is a separate change once the staging site is signed off.
