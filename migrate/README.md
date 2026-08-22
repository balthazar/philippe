# migrate

Standalone package that migrates content out of the legacy WordPress site
(MariaDB, table prefix `CTL6P_`) into JSON files, and later loads that JSON
into MongoDB. It is independent from `api/`: it has its own `package.json`
and its own `node_modules`.

## Setup

```bash
nvm use 24.19.0
cd migrate
npm install
```

## Database connection

Extraction reads from a MariaDB instance. Configure it with environment
variables, or rely on the defaults below (which match the `pg-wp` dev
container):

| Variable          | Default     |
|-------------------|-------------|
| `WP_MYSQL_HOST`   | `127.0.0.1` |
| `WP_MYSQL_PORT`   | `3399`      |
| `WP_MYSQL_USER`   | `root`      |
| `WP_MYSQL_PASSWORD` | `root`    |
| `WP_MYSQL_DB`     | `wp`        |

## Scripts

- `npm run extract` - reads posts, pages and attachments from MariaDB and
  writes `data/articles.json`, `data/pages.json` and `data/media.json`.
  Fails loudly (throws) rather than silently skipping or guessing when it
  hits an unmapped category or an unrecognized Elementor widget - a crash
  here is preferable to a missing photograph discovered months later.
- `npm run load` - loads the extracted JSON into MongoDB (Task 12).
- `npm run verify` - post-load verification (later task).
- `npm test` - runs the unit tests (`vitest run`).

`data/*.json` is gitignored: it holds the site's full content and should
never be committed.

## Extraction model

- WordPress posts and pages are translated via WPML. `pairByTrid` groups
  each language pair by `trid`; the French row is normally the base, except
  for the single English-only article (`nouveau-2024`), where the base
  falls back to the English row so the French title is never empty.
- `mapCategory` maps both the French and English category names onto one
  canonical slug (`works`, `exhibitions`, `editions`, `public-orders`) and
  throws on anything unmapped rather than defaulting.
- `parseYearLabel` splits a trailing `| 2024` or `| 2018-2021` off a title.
  Titles that merely contain a pipe without a trailing year (e.g.
  `Ampli | Boogie`) are left untouched.
- Only attachments with a mime type of `image/*` are extracted as media;
  PDFs, Word documents and other non-image attachments are not currently
  included.
