# Deploying to production

For running the site on your own machine, see [development.md](development.md)
-- note that local development uses this same production database.

Production is `philippe.balthazar.dev`, served from the single-node k3s cluster
at `135.148.100.142` (kubeconfig context `dadonew`), namespace `apps`. The API
lives on `/api` of the same origin, so the browser never makes a cross-origin
request and no CORS config is in play.

## How a request reaches a pod

```
philippe.balthazar.dev  (Cloudflare, proxied -- TLS terminates here)
        |  plain HTTP
        v
Traefik (k3s built-in, ingressClassName: traefik)
        |
        +-- /api    -> svc/philippe-api  :80 -> pod :8080
        +-- /media  -> svc/philippe-api  :80 -> pod :8080
        +-- /       -> svc/philippe-web  :80 -> nginx :8080
```

TLS is Cloudflare's job for every service on this cluster, which is why
`k8s/web.yaml` has no `tls:` block and no cert-manager annotation. Traefik
orders Ingress rules by path length, so `/api` and `/media` win over the
catch-all `/`. The API mounts those two prefixes itself (`api/src/app.js`), so
nothing strips them on the way in.

## One-time setup

1. **Push secret** -- `ghcr-creds` already exists in `apps` (shared with the
   other apps on this cluster). Nothing to do unless the PAT is rotated.

2. **API secrets** -- not yet created. `api/src/bootstrap.js` throws on a
   missing `JWT_SECRET` and seeds the admin user from `ADMIN_EMAIL` /
   `ADMIN_PASSWORD`, so all four have to exist before the first rollout:

   ```sh
   kubectl --context dadonew -n apps create secret generic philippe-api-secrets \
     --from-literal=MONGO_URI='mongodb://mongo.infra.svc.cluster.local:27017' \
     --from-literal=JWT_SECRET="$(openssl rand -hex 32)" \
     --from-literal=ADMIN_EMAIL='you@example.com' \
     --from-literal=ADMIN_PASSWORD="$(openssl rand -base64 24)"
   ```

   Both `openssl` calls are inline on purpose: the generated values go straight
   into the API server and never land in the transcript or shell history. Read
   the admin password back once, when you need to log in:

   ```sh
   kubectl --context dadonew -n apps get secret philippe-api-secrets \
     -o jsonpath='{.data.ADMIN_PASSWORD}' | base64 -d; echo
   ```

   `MONGO_URI` carries no credentials and no database name. The `infra/mongo`
   Deployment runs `mongo:7` with no `--auth` and no `MONGO_INITDB_ROOT_*`
   env, so it accepts unauthenticated in-cluster connections; and
   `api/src/db.js` passes `MONGO_DB` to mongoose as `dbName` separately.

   Rotating a value later is a replace, not an edit:

   ```sh
   kubectl --context dadonew -n apps create secret generic philippe-api-secrets \
     --from-literal=... --dry-run=client -o yaml | kubectl --context dadonew apply -f -
   kubectl --context dadonew -n apps rollout restart deploy/philippe-api
   ```

   Note `seedAdmin` only seeds on first run -- changing `ADMIN_PASSWORD` in the
   secret does not reset an admin user that already exists in Mongo.

3. **DNS** -- done. `philippe.balthazar.dev` resolves to Cloudflare
   (`104.21.54.130` / `172.67.138.182`), i.e. the record is proxied, and HTTPS
   already terminates there. It returns 404 until the Ingress is applied,
   because Traefik has no rule for the host yet.

## First deploy: order matters

The web image is prerendered at build time against a **live** API
(`PRERENDER_API_URL=https://philippe.balthazar.dev/api` in
`.github/workflows/deploy-web.yml`), and `site/prerender/index.js` fails the
build rather than shipping an empty SPA shell when that API is unreachable or
returns implausibly little content. So the API has to be up and publicly
reachable before the web image is ever built:

The web build additionally needs the `philippe` database to be **populated**.
`prerender/index.js`'s `checkFloor` aborts the build below 10 articles or 30
routes, so a live-but-empty API fails the image build just as an unreachable
one does. Run the migration before dispatching the web workflow.

```sh
kubectl --context dadonew apply -f k8s/api.yaml
kubectl --context dadonew -n apps rollout status deploy/philippe-api --timeout=180s
kubectl --context dadonew apply -f k8s/web.yaml   # Deployment, Service, Ingress
```

`k8s/api.yaml` also carries the `philippe-media` PVC (20Gi, `local-path`, the
cluster default). Because that volume is `ReadWriteOnce` and node-local, the
API Deployment is pinned to `replicas: 1` with `strategy: Recreate` -- do not
raise either without moving media off a node-local volume first.

Both manifests validate against the live API server:

```sh
kubectl --context dadonew apply -f k8s/api.yaml -f k8s/web.yaml --dry-run=server
```

## Ongoing deploys

`.github/workflows/deploy-api.yml` and `deploy-web.yml` run on pushes to
`master` that touch each side's inputs: test, build, push to GHCR, then
`kubectl set image` + `rollout status`. Both repository settings they depend on
are already in place on `balthazar/philippe`:

- secret `KUBECONFIG_B64` -- currently the admin `dadonew` context, i.e.
  cluster-admin. See "Deploy credential" below for the least-privilege
  alternative this cluster is already set up for.
- a `production` environment, which both `deploy` jobs reference

Two things to know about when they actually fire:

- Only pushes to `master` trigger them. Work on a feature branch deploys
  nothing until it merges.
- Both jobs run `kubectl set image` against an existing Deployment, so the
  very first rollout has to be the manual `kubectl apply` sequence above.
  After that, pushes take over.

The manifests pin `ghcr.io/balthazar/philippe-{api,web}:latest`; the workflows
derive the same name from `github.repository_owner`, which is `balthazar` for
`git@github.com:balthazar/philippe.git`. Moving the repo to another owner means
updating the two `image:` lines to match.

GHCR packages are created private on first push. The cluster pulls them with
the existing `ghcr-creds` secret, so that works as-is -- but if you ever want
anonymous pulls, flip each package to public under
<https://github.com/users/balthazar/packages>.

## Verifying

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://philippe.balthazar.dev/
curl -s https://philippe.balthazar.dev/api/articles?category=works | head -c 400
curl -s https://philippe.balthazar.dev/sitemap.xml | head -5   # <loc> hosts should be philippe.balthazar.dev
```

The sitemap, `robots.txt`, canonical links and OG tags are all baked into the
image from the `SITE_URL` build arg, so changing the public hostname means
rebuilding the web image, not just editing the Ingress.

## Deploy credential

This cluster already has a least-privilege CI identity: ServiceAccount
`default/gh-deployer`, bound by ClusterRoleBinding
`gh-deployer-deployments-binding` to ClusterRole
`cicd-deployer-min-deployments`, whose rules are exactly:

```
apiGroups: [apps]  resources: [deployments, deployments/status, deployments/scale]
verbs: [get, list, watch, create, update, patch]
```

That is precisely what `kubectl set image` + `kubectl rollout status` need and
nothing more -- no secrets, no exec, no pod deletion, no other API group. The
`apps`-namespace projects (wedding, wedding-trip) share one `KUBECONFIG_B64`
built on this SA. Three other projects went further and use a per-namespace
deployer instead, each with its own long-lived token Secret:
`bookdmv/deployer`, `discura/deployer`, `morphit/morphit-deployer`.

To give philippe its own scoped deployer rather than reusing the admin cert:

```sh
CTX=dadonew
kubectl --context $CTX -n apps create serviceaccount philippe-deployer

kubectl --context $CTX -n apps create role philippe-deployer \
  --verb=get,list,watch,patch,update \
  --resource=deployments.apps,deployments.apps/status
kubectl --context $CTX -n apps create rolebinding philippe-deployer \
  --role=philippe-deployer --serviceaccount=apps:philippe-deployer

# k8s 1.24+ does not auto-create SA tokens; this is the long-lived one.
kubectl --context $CTX apply -f - <<'EOF'
apiVersion: v1
kind: Secret
metadata:
  name: philippe-deployer-token
  namespace: apps
  annotations:
    kubernetes.io/service-account.name: philippe-deployer
type: kubernetes.io/service-account-token
EOF
```

Then build a kubeconfig from that token and set it as `KUBECONFIG_B64`:

```sh
SERVER=https://135.148.100.142:6443
CA=$(kubectl --context $CTX -n apps get secret philippe-deployer-token -o jsonpath='{.data.ca\.crt}')
TOKEN=$(kubectl --context $CTX -n apps get secret philippe-deployer-token -o jsonpath='{.data.token}' | base64 -d)
cat <<EOF | base64 | tr -d '\n' | gh secret set KUBECONFIG_B64 -R balthazar/philippe
apiVersion: v1
kind: Config
clusters: [{name: dadonew, cluster: {server: $SERVER, certificate-authority-data: $CA}}]
users: [{name: philippe-deployer, user: {token: $TOKEN}}]
contexts: [{name: dadonew, context: {cluster: dadonew, user: philippe-deployer, namespace: apps}}]
current-context: dadonew
EOF
```

The Role above is namespace-scoped to `apps` and, unlike the shared
`gh-deployer` ClusterRole, cannot touch Deployments in `immich`, `bookdmv`,
`hostpad` or anywhere else. Verify before switching CI over:

```sh
kubectl --context $CTX -n apps auth can-i patch deployments --as=system:serviceaccount:apps:philippe-deployer
kubectl --context $CTX -n apps auth can-i get secrets     --as=system:serviceaccount:apps:philippe-deployer   # expect: no
```
