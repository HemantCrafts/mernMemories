# Deploying MERN Memories to Render

This guide takes the app from your machine to a public URL. Render builds from
a **Git repository**, so the first step is getting the code onto GitHub.

Total time: roughly 15–20 minutes, most of it waiting for the first build.

---

## Before you start: two things to know

**1. MongoDB is not provided by Render.** Render has no managed MongoDB, so the
app keeps using your existing **MongoDB Atlas** cluster. That cluster must be
reachable from Render's servers, which means widening the Atlas IP allowlist.

**2. The free tier has no persistent disk.** Render's free instances use an
ephemeral filesystem, so **uploaded images are deleted whenever the instance
restarts** — which the free tier does after ~15 minutes of inactivity. Text
data (users, posts, likes, follows, comments) lives in Atlas and is unaffected.
Only images are lost. See "Persisting uploads" at the end for the fix.

---

## Step 1 — Push the project to GitHub

The project is not currently a git repository, so initialise it first.

From the project root (`social media App/`):

```bash
git init
git add .
git commit -m "MERN Memories: full-stack social media app"
```

Before pushing, **confirm `server/.env` is not staged** — it holds your real
Atlas password:

```bash
git status --porcelain | grep "\.env$"
```

That command should print nothing. If it prints `server/.env`, stop and check
that `.gitignore` still contains the `.env` line.

Now create an empty repository on GitHub (no README, no .gitignore — this
project already has one), then:

```bash
git remote add origin https://github.com/<you>/<repo>.git
git branch -M main
git push -u origin main
```

---

## Step 2 — Allow Render to reach Atlas

In the [Atlas dashboard](https://cloud.mongodb.com):

1. Open your cluster → **Network Access** → **Add IP Address**
2. Choose **Allow Access from Anywhere** (`0.0.0.0/0`)

**Why this is required:** Render's outbound IPs are not fixed on the free tier,
so you cannot allowlist a single address. `0.0.0.0/0` means "any host may
attempt a connection" — it is safe *only* because the database still requires a
username and password. This is the standard trade-off for PaaS hosting.

> If you would rather not open the database to all IPs, the alternative is a
> paid Render plan with static outbound IPs, or hosting on a VPS you control.
> For a portfolio project the credential-protected `0.0.0.0/0` is normal.

---

## Step 3 — Create the Render service

1. Go to [dashboard.render.com](https://dashboard.render.com) → **New** →
   **Blueprint**
2. Connect your GitHub account and pick the repository
3. Render reads `render.yaml` and shows one service named **mern-memories**
4. It will prompt for the two secret variables — fill them in:

| Variable | Value |
| --- | --- |
| `MONGODB_URI` | Your full Atlas connection string, including `/socialapp?retryWrites=true&w=majority` |
| `CLIENT_ORIGIN` | Leave blank for now — set it in Step 5 |

5. Click **Apply** / **Create**

The first build takes 3–6 minutes: it installs three dependency trees and
compiles the React app.

### If you prefer to configure manually

Create a **Web Service** instead of a Blueprint and use these settings:

| Setting | Value |
| --- | --- |
| Runtime | Node |
| Build Command | `npm install --include=dev && npm --prefix client install --include=dev && npm --prefix server install --include=dev && npm --prefix client run build` |
| Start Command | `npm --prefix server start` |
| Health Check Path | `/api/health` |

Environment variables:

```
NODE_ENV=production
NODE_VERSION=22
JWT_EXPIRES_IN=7d
UPLOAD_DIR=/var/data/uploads
MONGODB_URI=<your Atlas URI>
JWT_SECRET=<48+ random chars>
CLIENT_ORIGIN=https://<your-service>.onrender.com
```

Generate a strong secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

---

## Step 4 — Watch the first deploy

Open the service's **Logs** tab. A healthy boot looks like:

```
[db] MongoDB connected -> ac-xxxxx-shard-00-00.xxxxx.mongodb.net/socialapp

  MERN Social API
  mode   : production
  api    : http://localhost:5000/api
  health : http://localhost:5000/api/health
```

### The app now refuses to boot on a bad config — on purpose

If you see either of these, the fix is in the **Environment** tab, not the code:

```
[config] JWT_SECRET is too weak for production.
```
The secret is missing, is still a placeholder, or is under 32 characters.

```
[config] CLIENT_ORIGIN must be set in production.
```
`CLIENT_ORIGIN` is unset. This guard exists because a wrong value silently
breaks every request from the browser with a CORS error, which is much harder
to diagnose than a failed deploy.

If you see:

```
[db] Connection attempt 1/3 failed: bad auth : Authentication failed.
```

the Atlas password is wrong, or the user lacks access to the `socialapp`
database. Check the password is URL-encoded if it contains `@ : / #`.

---

## Step 5 — Set CLIENT_ORIGIN to the real URL

Once the service is live you will have a URL like:

```
https://mern-memories.onrender.com
```

Go to **Environment**, set:

```
CLIENT_ORIGIN=https://mern-memories.onrender.com
```

Save. Render redeploys automatically.

**Why this step exists:** the browser sends the page's origin as the `Origin`
header on every API call, and the server rejects anything not on the list. An
empty or wrong value produces this in the browser console:

```
Origin not allowed by CORS: https://mern-memories.onrender.com
```

Comma-separate multiple origins (for example a custom domain plus the
`onrender.com` one).

---

## Step 6 — Seed demo data (optional)

The seed script writes three demo accounts and sample posts. Run it once from
the Render **Shell** tab:

```bash
npm --prefix server run seed
```

Then log in at your URL with `ada` / `Password123!`.

> The seed script is idempotent — it clears the demo users and their posts
> before recreating them, so running it twice is safe. **It does delete those
> three demo accounts and their content**, so do not point it at a database
> where real users have taken over those usernames.

---

## Step 7 — Verify the deploy

Replace the placeholder with your URL:

```bash
curl https://YOUR-SERVICE.onrender.com/api/health
```

Expect `{"status":"ok","env":"production","database":"connected",...}`.

Then open the URL in a browser and check:

- The feed loads (proves the API and Atlas work)
- Registering a new account succeeds (proves writes work)
- The theme toggle still works and survives a refresh (proves `redux-persist`)
- Hard-refresh on `/profile` directly — it should still load, not 404
  (proves the SPA fallback)

---

## Persisting uploads

On the free tier every uploaded image disappears when the instance restarts.
Text data is safe in Atlas; only images are affected.

To make uploads durable, upgrade to a paid instance and uncomment the `disk:`
block at the bottom of `render.yaml`:

```yaml
    disk:
      name: mern-memories-uploads
      mountPath: /var/data
      sizeGB: 1
```

The default `UPLOAD_DIR` is `/var/data/uploads`, which sits inside that mount,
so uploaded images then survive restarts and redeploys.

**The alternative** is the pluggable storage driver — uploading to Cloudinary
or S3 instead of local disk. That works on the free tier because the images no
longer live on the ephemeral filesystem. It is not built yet; it is the natural
next step if you want durable images without paying for a disk.

---

## Running with Docker instead

`Dockerfile` builds a multi-stage production image:

```bash
docker build -t mern-memories .
docker run -p 5000:5000 \
  -e NODE_ENV=production \
  -e MONGODB_URI="mongodb+srv://..." \
  -e JWT_SECRET="$(node -e "console.log(require('crypto').randomBytes(48).toString('hex'))")" \
  -e CLIENT_ORIGIN="http://localhost:5000" \
  -v mern-memories-uploads:/app/server/uploads \
  mern-memories
```

The `-v` volume is what keeps uploads alive across container restarts. This is
the same image any Docker host (Fly.io, Railway, a VPS) would run.

---

## Troubleshooting

**Build fails: `vite: not found`**
The build command must include `--include=dev`. Vite, Tailwind and PostCSS are
`devDependencies`, and hosting platforms default to omitting them.

**Site loads but every action fails with a CORS error**
`CLIENT_ORIGIN` does not exactly match the URL in the address bar. Note that
`https://x.onrender.com` and `http://x.onrender.com` are different origins, as
are a trailing-slash and non-trailing-slash form.

**`Application failed to respond` / health check times out**
The app takes up to ~40 seconds to fail a bad Atlas connection (3 retries with
timeouts). A wrong `MONGODB_URI` therefore looks like a hung deploy. Check the
logs for `[db] Connection attempt`.

**Deploy succeeds, then the site is slow for the first request**
Render's free tier sleeps after ~15 minutes idle and cold-starts in 30–60
seconds. This is expected, not a bug.

**Images work, then 404 after a while**
That is the ephemeral filesystem. See "Persisting uploads" above.

**`npm test` fails in CI**
Not part of the deploy. Tests need `mongodb-memory-server`, which downloads a
`mongod` binary (~100 MB) on first run, and the build sandbox may block that.
Run them locally instead.
