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

**Copy the files BEFORE the content that references them.** Cloudflare caches
404s for four hours (`max-age=14400`). If a page goes live naming an image the
cluster does not have yet, the first request caches a 404 at the edge and the
image stays broken for four hours after the file arrives -- the origin serves
it perfectly the whole time, which makes this look like a failed copy when it
is not. Check the origin past the cache before re-copying anything:

```sh
curl -sI https://philippe.balthazar.dev/media/<path>          # cf-cache-status: HIT, 404
curl -sI "https://philippe.balthazar.dev/media/<path>?v=$(date +%s)"   # 200 -- the file is there
```

Purge the URLs in the Cloudflare dashboard to clear it early. Note it hits
only the variant the page actually requests (`medium`, via BlockRenderer's
`Picture`), so `thumb` and `large` of the same image will serve fine and make
the failure look stranger than it is.

To sync everything the cluster is missing, byte-order sort both sides (the
pod's `sort` and macOS's disagree on locale, which silently produces a garbage
diff) and stream only the difference:

```sh
kubectl --context dadonew -n apps exec deploy/philippe-api -- \
  sh -c 'cd /data/media && find . -type f | LC_ALL=C sort' > /tmp/prod-files.txt
cd /tmp/philippe-media && find . -type f | LC_ALL=C sort > /tmp/local-files.txt
LC_ALL=C comm -23 /tmp/local-files.txt /tmp/prod-files.txt > /tmp/to-copy.txt
tar -cf - -T /tmp/to-copy.txt \
  | kubectl --context dadonew -n apps exec -i deploy/philippe-api -- tar -C /data/media -xf -
```

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

## The old WordPress host, and the texts it held

The bibliography used to link eleven `.doc`/`.pdf`/`.jpeg` documents that only
`www.philippegronon.com` served: texts on Gronon's work by Éric de Chassey,
Hubert Besacier, Catherine Francblin, Nathalie Desmet, Régis Durand, Éric
Mézil and Jérôme Sans. They are not in the media store (the image pipeline
takes images only), and **none of them is in the Wayback Machine** -- checked,
0 of 11.

Those links are now removed. The citations are untouched: each entry still
names the text, its author and where it was published, and simply no longer
offers a file that is about to stop existing. Nothing on the site depends on
that host any more.

The documents themselves are in `.archive-documents/` (gitignored, ~2.5MB),
pulled while the host was still up, along with the `PDFs.zip` bundle the old
site offered. Nothing serves them -- that directory is preservation, so the
texts survive the host even though the site no longer points at them.

To offer them again, in increasing order of effort:

1. **Save each to the Wayback Machine** (`https://web.archive.org/save/<url>`)
   while the host is still up, and link the snapshots. Cheapest, and it puts
   the texts somewhere permanent and public.
2. **Host them ourselves.** The honest fix, and a real feature: the media
   route and `imagePipeline` are image-only, so serving documents means a
   second asset path (no variants, no sharp, a stricter allowlist of types)
   plus admin upload for it.

Two of the original thirteen needed neither: Michel Poivert's *La photographie
contemporaine* and Régis Durand's *Le Regard pensif* both exist as full scans
on archive.org, and link there instead.
