# Philippe Gronon site: design

Date: 2026-08-22
Status: approved (design), pending implementation plan

## 1. Goal

Replace the existing WordPress site (WPML + Elementor + The7 theme) with a custom
React / Node / MongoDB application. Keep the minimal, image-led character of the
current site while imposing a firmer structure: a uniform grid, one typographic
scale, and a decade-grouped archive in place of the current sprawling dropdown.

The site owner must be able to add and edit all content, in French and English,
without a developer.

## 2. Source material

A Plesk backup, `backup_philippegronon.com_2608071937.tar` (1.7 GB), sits in the
repo root and is gitignored. It contains:

- `databases/wp_4cno7_1/backup_sqldump_2608071937.tzst`: a MariaDB dump of the
  WordPress database, table prefix `CTL6P_`.
- `backup_user-data_2608071937.tzst` (1,715,337,353 bytes): the site files,
  including `wp-content/uploads`.

Content inventory, measured from the imported dump:

| Item | Count |
|---|---|
| Published posts | 125 (62 FR + 63 EN, paired by WPML `trid`) |
| Published pages | 14 (7 FR + 7 EN) |
| Attachments | 1324 (1196 jpeg, 70 svg, 8 png, 8 tiff, 8 pdf, rest documents) |
| Posts with a featured image | 125 (all) |
| Posts built with Elementor | 125 (all) |
| Post date range | 1984 to 2024 |

Every published post carries exactly one category. Counted from
`term_relationships` rather than from WordPress's cached `term_taxonomy.count`,
which is stale in this database and disagrees with the real assignment:

| Category (FR / EN) | FR posts | EN posts |
|---|---|---|
| Œuvres / Works | 33 | 34 |
| Expositions / Expositions | 25 | 25 |
| Éditions / Editions | 3 | 3 |
| Commandes publiques / Public Orders | 1 | 1 |
| Total | 62 | 63 |

One published article exists in English only: "Nouveau | 2024" (`nouveau-2024`,
category Works, with a cover image). Its title is already French, which is
presumably why it was never translated.

Because one article in this model holds both languages, the 125 source posts
become **63 articles** (62 pairs plus the 1 unpaired), and the 14 source pages
become **7 pages**.

Pages: Accueil/Home, Œuvres/Works, Biographie/Biography,
Bibliographie/Bibliography, Contact, Liens/Links, Mentions Légales/Terms and
Conditions.

Elementor widget frequency across published posts: `text-editor` 371,
`spacer` 232, `heading` 228, `the7_nav-menu` 125, `wpr-media-grid` 78,
`image` 77, `post-navigation` 75, `image-gallery` 73, `global` 1.

The narrowness of that widget set is what makes a clean migration possible: the
content is text, headings, images and galleries, and everything else is theme
chrome that is dropped.

## 3. Decisions

| Decision | Choice | Reason |
|---|---|---|
| Languages | Bilingual FR/EN from the start | Retrofitting touches every field, form and route |
| Translation semantics | FR is the base value; EN is an optional override; empty EN falls back to FR at read time | Most values (work titles) do not need translating |
| Missing base language | Where no FR source exists, the EN source populates the FR base | The base value must never be empty, or the fallback resolves to nothing |
| Editable scope | Articles plus all pages, including biography and contact | Owner autonomy |
| Structure | Single article collection with a `category` field; four nav items | Éditions and Commandes publiques hold 4 articles between them |
| Éditions / Commandes publiques | Labelled sections at the foot of the Works page | Matches the current live page order |
| Content shape | Ordered typed blocks | Mirrors the Elementor data; keeps layout in code, not in stored markup |
| Stack | Vite + React SPA, Express API, MongoDB | Matches the existing `wedding` app pattern on the cluster |
| Rendering | SPA plus a deploy-time prerender of every article and page | Preserves search visibility at cutover without a Node renderer |
| Host | `philippe.natazar.org` first | Live site stays up until the migration is verified |

`react-scripts` is deprecated, so this uses Vite rather than copying the CRA
setup from `wedding`.

## 4. Target infrastructure

Cluster `dadonew`: single-node k3s v1.35.4+k3s1, external IP 135.148.100.142,
Traefik ingress class, `local-path` default storage class, no cert-manager.

Reused as-is:

- MongoDB at `mongo.infra.svc.cluster.local:27017`, new database `philippe`.
- Namespace `apps`, `imagePullSecrets: ghcr-creds`, GHCR images, containers on
  port 8080 with `/health` probes, deployed by GitHub Actions on push to
  `master`. This mirrors `/Users/b/git/wedding/k8s/*.yaml`.

New:

- Images `ghcr.io/goobernetics/philippe-api` and `philippe-web`.
- A 20Gi `local-path` PVC named `philippe-media`, mounted at `/data/media` in
  the API pod. `local-path` is node-local and `ReadWriteOnce`, which is
  acceptable only because the cluster has one node. The API deployment is
  therefore pinned to `replicas: 1` with a `Recreate` strategy, and the
  manifest carries a comment saying so. Moving to more than one node or replica
  requires object storage first.
- Ingress `philippe` on `philippe.natazar.org`: `/api` and `/media` to
  `philippe-api`, `/` to `philippe-web`.

## 5. Repository layout

```
philippe/
  package.json          Vite + React web app
  index.html
  src/
    public-site/        Public pages and components
    admin/              Admin SPA, lazy-loaded at /admin
    lib/                API client, localization helper, routing
  prerender/            Deploy-time static HTML generation
  nginx.conf
  Dockerfile            Web image
  api/
    Dockerfile
    package.json
    src/
      server.js, db.js
      models/           Article, Page, Image, User, Home
      routes/           public, admin, auth, media
      middleware/       auth, upload, errors
      lib/              localize, imagePipeline, slug, sanitize
    test/
  migrate/
    extract.js          MariaDB to normalized JSON
    elementor.js        _elementor_data to blocks
    load.js             JSON plus files to Mongo and disk
    verify.js           Post-migration report
    test/fixtures/
  k8s/                  api.yaml, web.yaml
  .github/workflows/    deploy-api.yml, deploy-web.yml
  docker-compose.dev.yml
```

## 6. Data model

### Localized values

A localized field is `{ fr: String, en: String }`. All reads go through one
helper:

```js
localize(field, lang) // returns field[lang] || field.fr
```

The admin writes `en` only when the editor supplies an override, and a "revert
to French" control unsets it. There is no separate "is translated" flag; an
absent or empty `en` is the fallback signal.

### Article

| Field | Type | Notes |
|---|---|---|
| `slug` | localized | Per-language, seeded from the WordPress `post_name`, preserving existing public URLs |
| `category` | enum | `works`, `exhibitions`, `editions`, `public-orders` |
| `title` | localized | |
| `yearLabel` | localized | Display string such as "2018-2021" |
| `yearStart`, `yearEnd` | Number | Sorting and decade grouping |
| `cover` | ref Image | Grid thumbnail and slideshow source |
| `blocks` | [Block] | Ordered body |
| `status` | enum | `draft`, `published` |
| `position` | Number | Manual override within a category; defaults to year descending |
| `featured` | Boolean | "En avant". One toggle, two effects: the work joins the homepage slideshow and takes a double-width card in the works list |
| `seoDescription` | localized | |
| `legacyWpId` | Number | Migration idempotency key, indexed |

Indexes: unique on `slug.fr` and `slug.en`; compound on
`(category, status, yearStart)`; unique sparse on `legacyWpId`.

### Block

A discriminated union stored in order:

- `text`: `{ value: localized }`, sanitized HTML.
- `heading`: `{ value: localized, level: 2 | 3 }`.
- `image`: `{ image: ref, caption: localized, size: 'full' | 'wide' | 'inset' }`.
- `gallery`: `{ items: [{ image: ref, caption: localized, span: 1..6 }], columns: 1..6 }`.
  `columns` is the gallery's grid width and `span` is how many of those columns
  one image occupies. A span is clamped to the block's column count at render,
  so reducing `columns` after the fact can never produce a broken grid.
- `specs`: `{ items: [{ term: localized, value: localized }] }`, rendered as a
  definition list.

The `specs` type exists because the source content contains 228 `dl`/`dt`/`dd`
structures carrying provenance data. Capturing them as data rather than as
free-form markup is what makes consistent styling, and later filtering,
possible.

### Page

A keyed singleton: `key` is one of `home`, `works`, `exhibitions`, `biography`,
`contact`, `bibliography`, `links`, `legal`; plus `title` localized, `blocks`,
and `seoDescription`.

`works` and `exhibitions` are listing pages, so their blocks are an optional
introduction rendered above the grid rather than the whole page. The current
site has such an introduction on `/oeuvres`, describing the artist's practice,
and it must survive the migration. `biography` and `contact` are the pages
required by the brief. `bibliography`, `links` and `legal` exist because the
current site has them, and are linked from the footer.

### Image

`filename` (content hash), `originalName`, `mime`, `width`, `height`, `bytes`,
`alt` localized, `variants` (`thumb` 600w, `medium` 1400w, `large` 2400w, all
webp, plus the preserved original), `legacyWpId`, `legacyUrl`, `createdAt`.

Content-hashed filenames mean variants are immutable and can be served with a
one-year cache header. Every stored path is a pure function of the content hash
(`<shard>/<hash>-<variant>.webp`, sharded on the hash's first two characters),
never of the clock, so re-running the migration writes the same bytes to the
same place instead of orphaning the previous run's files.

The three derived variants are the only files ever served. The original is kept
byte-exact as an archival master under an `_originals/` prefix that the media
route refuses: because it is the one file not re-encoded, it still carries its
own EXIF, and it is not the frontend's to display.

Dimensions are display-true. `sharp().metadata()` reports pre-rotation values
while the variants are auto-oriented, so an EXIF-rotated photograph would
otherwise report a swapped aspect ratio and render the wrong placeholder shape.

### Home

A single document holding `slides: [{ image: ref, article: ref | null, caption:
localized }]`, retained as a manual override. In normal operation it is empty and
the slideshow is exactly the set of articles flagged `featured`, so the artist
curates it from the article editor rather than from a second screen.

### User

`email`, `passwordHash` (bcrypt), `createdAt`, `updatedAt`.

## 7. API

Public, read-only, published content only:

```
GET  /health
GET  /api/articles?category=&lang=            list, sorted, paginated
GET  /api/articles/:slug?lang=                one article with populated images
GET  /api/pages/:key?lang=
GET  /api/home?lang=
GET  /api/sitemap.xml                         source data for the prerender step
GET  /media/:filename                         immutable cache headers
```

Authenticated, under `/api/admin`:

```
POST   /api/auth/login          sets cookie
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/password
GET    /api/admin/articles      includes drafts
POST   /api/admin/articles
PATCH  /api/admin/articles/:id
DELETE /api/admin/articles/:id
POST   /api/admin/articles/reorder
PATCH  /api/admin/pages/:key
GET    /api/admin/images
POST   /api/admin/images        multipart upload
PATCH  /api/admin/images/:id    alt text
DELETE /api/admin/images/:id    refused when referenced
```

Admin responses return raw localized objects (both `fr` and `en`) so the editor
can distinguish an override from a fallback. Public responses return resolved
strings for the requested language.

## 8. Security

- Password hashing with bcrypt. The first admin is seeded at API start from
  `ADMIN_EMAIL` and `ADMIN_PASSWORD`, and only when the users collection is
  empty. The password is changeable from the admin.
- A 12-hour JWT in an httpOnly, Secure, SameSite=Lax cookie. No token in
  localStorage, so an injected script cannot read it.
- Mutating requests require a custom header (`X-Requested-With`), which
  same-origin fetch sends and a cross-site form post cannot.
- Login is rate limited per IP with a single generic failure message for both
  unknown email and wrong password.
- Uploads: size cap, image mime whitelist, and a mandatory re-encode through
  sharp for every served variant, which strips EXIF and neutralizes payloads
  embedded in image files. Stored filenames come from the content hash, never
  from the client. The unmodified original is retained for archival purposes but
  is never served, so unvalidated bytes are never handed to a visitor.
- `helmet`, a JSON body size limit, and CORS restricted to the site origin.
- Secrets (`MONGO_URI`, `JWT_SECRET`, `ADMIN_EMAIL`, `ADMIN_PASSWORD`) are a
  k8s Secret created out of band, following the documented pattern in
  `wedding/k8s/api.yaml`. They are never committed.

## 9. Migration

Three runnable steps plus a verification pass. All are idempotent and keyed on
`legacyWpId`, so a re-run corrects rather than duplicates.

**Step 1, `extract.js`.** The dump is imported into a local MariaDB container
(`docker run mariadb:10.11`, dump piped in) and read from there rather than
parsed as text, because the dump uses extended inserts with embedded newlines.
It writes `migrate/data/{articles,pages,media}.json`.

- FR and EN posts are paired through `CTL6P_icl_translations.trid`.
- Categories come from `term_relationships` and map to the four `category`
  values, with the FR and EN category pairs collapsing to one value.
- `_elementor_data` JSON is walked and mapped by `elementor.js`.
- `_thumbnail_id` becomes `cover`.
- `yearLabel` is taken from the title where it carries a date range, with
  `yearStart` and `yearEnd` parsed from it, falling back to `post_date`.

**Step 2, `elementor.js`.** Maps widgets to blocks:

| Widget | Becomes |
|---|---|
| `text-editor` | `text`, sanitized. A contained `dl` is lifted out into its own `specs` block, splitting the widget into up to three blocks (text before, specs, text after) so document order is preserved |
| `heading` | `heading` |
| `image` | `image` |
| `image-gallery`, `wpr-media-grid` | `gallery` |
| `spacer`, `the7_nav-menu`, `post-navigation`, `global` | dropped |

An unrecognized widget type is a hard error listing the type and post, not a
silent skip. Adding a mapping is cheap; discovering months later that content
vanished is not.

**Step 3, `load.js`.** Extracts only referenced files from the user-data
archive, runs each through the sharp pipeline into `/data/media`, and upserts
Mongo documents. Runs against the cluster through a port-forward, or locally
against docker-compose.

**Step 4, `verify.js`.** Fails loudly unless: 63 articles exist (the 125 source
posts are 62 FR/EN pairs plus 1 EN-only article, and each pair becomes one
bilingual article), every article has a cover and at least one block, every
referenced image exists on disk with all three variants, every article has a
unique FR and EN slug, and exactly 62 articles carry a distinct EN override. It also writes a report listing any article
whose block count dropped relative to its Elementor widget count, which is the
signature of silent content loss.

**URL preservation.** Slugs carry over from `post_name`, so existing article
URLs keep working after cutover. Where the old path shape differs, the
prerender step emits redirects.

Sanitizing whitelist: `p`, `br`, `em`, `strong`, `a[href]`, `ul`, `ol`, `li`,
`dl`, `dt`, `dd`, `blockquote`. Theme classes and inline styles are stripped.

## 10. Frontend

Routes: `/`, `/oeuvres`, `/oeuvres/:slug`, `/expositions`, `/expositions/:slug`,
`/biographie`, `/contact`, plus footer pages, mirrored under `/en/...` with
English slugs. Unknown paths render a 404.

Structural decisions, in order of impact:

1. The Works page groups articles by decade with sticky decade headings,
   replacing the current dropdown archive. Éditions and Commandes publiques
   follow as labelled sections at the foot.
2. Cards use a uniform aspect ratio with images letterboxed on a neutral
   ground, so the grid reads as a grid. Title and year sit on single lines
   beneath. A `featured` work takes a double-width cell, giving the archive
   hierarchy without breaking alignment.
3. One type family in two weights on a four-step scale, one container width,
   consistent gutters.
4. A slim sticky header: wordmark, four nav items, FR/EN toggle. On mobile the
   same four items, not a nested tree.
5. The homepage slideshow is full-bleed, one work per slide, with a minimal
   caption linking to the work. Keyboard arrows, pause on hover and focus, and
   autoplay disabled under `prefers-reduced-motion`.
6. Article pages are image-led, captions in a consistent column, `specs` as a
   definition list, prev/next at the foot. Galleries open a keyboard-navigable
   lightbox. Each gallery block has an editor-chosen column count from 1 to 6,
   and each image within it spans 1 to 6 of those columns.

Image sizing is deliberately two settings and no more: `span` per gallery image,
and `featured` per article. Both draw from a fixed vocabulary rather than free
pixel values, so the editor gets real control without reintroducing the ragged
layout the restructure exists to remove.

Images render with `srcset` from the three variants inside aspect-ratio boxes,
so nothing shifts during load. Alt text comes from the Image model.

The language toggle preserves the current article by following the paired slug.

**Prerender.** After the Vite build, a script walks the published content and
writes static HTML per route, including meta and Open Graph tags
and `hreflang` pairs. It also writes `/sitemap.xml` and `/robots.txt` into the
web bundle, so crawlers fetch them from the site root rather than from under
`/api`. Crawlers and link previews get real HTML; the SPA takes over on load. Content added in the admin appears immediately through the SPA
and gains static HTML at the next deploy.

It reads content from `PRERENDER_API_URL`, which the web deploy workflow points
at the already-deployed API. This ordering matters: the API deploys first, and
on the very first deploy, or whenever the API is unreachable, the prerender step
logs a warning and ships the SPA shell alone rather than failing the build. A
broken deploy is worse than a deploy that is briefly missing static HTML.

## 11. Local development

`docker-compose.dev.yml` runs MongoDB and a MariaDB seeded from the dump, so the
migration can be developed and re-run locally without touching the cluster. The
API runs with `/data/media` bound to a local directory and the web app runs
under the Vite dev server, proxying `/api` and `/media` to the API. The admin is
reachable at `/admin` with a seeded local account.

## 12. Testing

Test-first throughout.

- API: vitest and supertest against `mongodb-memory-server`. Auth (rejects
  without cookie, rate limit trips, logout invalidates), article CRUD,
  localization fallback, drafts absent from public endpoints, the upload
  pipeline on a fixture image, and image deletion refused while referenced.
- Migration: `elementor.js` unit tests against fixtures captured from real
  posts in the dump, covering each widget type, the `dl` to `specs` lift, and
  the unknown-widget error.
- Frontend: React Testing Library on the block renderer, the FR/EN fallback,
  language toggle slug pairing, and slideshow controls including reduced
  motion.
- Post-deploy smoke check against `/health` and the public API.

## 13. Out of scope

WooCommerce (9 products, 41 variations) is not migrated; the current site has a
shop that this brief does not cover. Revolution Slider content is not migrated;
the homepage slideshow is rebuilt from selected work covers. Comments, Yoast
metadata beyond descriptions, and the 24 Word documents and 8 PDFs among the
attachments are not migrated unless they turn out to be linked from article
bodies, which the migration verification will reveal. Those non-image
attachments are 24 `.doc`, 8 `.docx`, 8 `.pdf` and 2 `.zip` files.

DNS cutover to `philippegronon.com` is a later, separate change.
