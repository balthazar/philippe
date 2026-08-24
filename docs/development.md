# Running the site locally

Local development runs against the **production** database. There is one
`philippe` database and both this machine and philippe.balthazar.dev read and
write it, so an edit saved in the local admin is live on the public site
immediately, and content changed on the public site shows up here on the next
request. That is deliberate: the alternative is two copies of the artist's
content drifting apart, with no way to tell which one is right.

Three terminals:

```sh
./scripts/dev-mongo.sh     # port-forward to the cluster's Mongo on :27019
./scripts/dev-api.sh       # API on :8090, against that database
cd site && npm run dev     # Vite on :5173, proxying /api and /media to :8090
```

Order matters only for the first two: `dev-api.sh` refuses to start if nothing
is listening on 27019, rather than booting and failing on the first query.

## What is and is not shared with production

| | Shared | Notes |
|---|---|---|
| Articles, pages, images (the database) | yes | one `philippe` database, no local copy |
| Media files | **no** | see below |
| Admin login | yes | production's credentials |

**Media is local.** `MEDIA_ROOT` is a directory on this machine, so an image
uploaded through the local admin creates a database record production can see
pointing at a file production does not have -- it will 404 there until the file
is copied onto the cluster's `philippe-media` volume:

```sh
tar -C /tmp/philippe-media -cf - <relative/path> \
  | kubectl --context dadonew -n apps exec -i deploy/philippe-api -- tar -C /data/media -xf -
```

Prefer uploading images through the production admin and letting the local site
read the records; that way the file lands where it is served from.

**The admin login is production's.** `seedAdmin()` only creates a user when the
collection is empty, and production's already holds the real admin, so no local
user is seeded. Read the password back with the command in
[deploy.md](deploy.md).

## Why the port-forward needs a wrapper

`kubectl port-forward` is not durable: it drops on an idle connection, on an
API-server hiccup, and whenever the mongo pod restarts. A bare invocation left
running for a day will not survive the day, and from the API's side the failure
is silent -- it simply stops being able to reach Mongo. `scripts/dev-mongo.sh`
reconnects instead.

## The local Mongo in docker-compose.dev.yml

Still there, still on :27018, but now only the WordPress migration's scratch
database (`migrate/`). Nothing else reads it. Its `mariadb` sibling is the
migration's source WordPress database.

Note what this means for the migration: `migrate/load.js` rewrites `title`,
`subtitle` and `blocks` on every run (it preserves only artist-set fields --
`status`, `cover`, `featured`, gallery `hidden`/`mode`). Pointed at the
production database it would overwrite edits made in the admin. The migration
has already been run and its output loaded; treat re-running it against
production as a content-destroying operation, not a refresh.
