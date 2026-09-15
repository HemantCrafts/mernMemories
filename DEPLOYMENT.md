# Deploying MERN Memories to Render

This guide takes the app from your machine to a public URL. Render builds from
a **Git repository**, so the first step is getting the code onto GitHub.

Total time: roughly 15–20 minutes, most of it waiting for the first build.

---

## If your deploy already failed, read this first

The single most common failure is the deploy ending with:

```
[db] Connection attempt 3/3 failed: Could not connect to any servers in your
MongoDB Atlas cluster. One common reason is that you're trying to access the
database from an IP that isn't whitelisted.
```

**This is not a code or config problem. It is Step 2 below, and it is a
dashboard action on Atlas.** The connection string is fine — the same one works
from your laptop. Atlas is refusing Render's IP address because it is not on the
allowlist.

### Get Render's exact IP ranges (preferred — do not open the database to everyone)

Render sends outbound traffic from **fixed CIDR ranges that are shared by all
services in a region**. You can allowlist just those ranges, which keeps the
database reachable from Render and nowhere else.

1. In the [Render Dashboard](https://dashboard.render.com), open **your service**
   (not the workspace home — the tab only exists on a service page)
2. Click the **Connect** dropdown in the upper right
3. Switch to the **Outbound** tab
4. Copy every listed CIDR range (e.g. `216.24.60.0/24`)

Then, in [Atlas](https://cloud.mongodb.com):

5. **Security → Network Access** (older UI: **Network Access** in the sidebar)
6. **+ Add IP Address** → paste one range → description `render` → **Confirm**
7. Repeat for each remaining range
8. Wait for the entries to flip from "Pending" to **Active** (a minute or two)
9. Back in Render: **Manual Deploy → Deploy latest commit**

> **If the Outbound tab is missing**, either you are on the workspace home page,
> or your workspace predates 23 January 2022 and is in the Oregon region — those
> older Oregon workspaces genuinely have no fixed ranges. Only in that case fall
> back to `0.0.0.0/0` below.

### Fallback: allow everything

If you cannot use the ranges above, add `0.0.0.0/0` instead. It means "any host
may *attempt* a connection", and it is safe enough because the database still
requires the username and password — but it is strictly worse than listing
Render's ranges, so prefer those.

**How to tell this apart from a credentials problem:** a wrong password produces
`bad auth : Authentication failed`, not the whitelist message. The two are
different errors with different fixes.

---

## Before you start: two things to know

**1. MongoDB is not provided by Render.** Render has no managed MongoDB, so the
app keeps using your existing **MongoDB Atlas** cluster. That cluster must be
reachable from Render's servers, which means allowlisting Render's outbound IP
ranges in Atlas. **Do Step 2 before the first deploy** — skipping it is the most
common reason a deploy fails.

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

Render sends outbound traffic from **fixed CIDR ranges shared by all services in
a region** (see [Render's outbound IP docs](https://render.com/docs/outbound-ip-addresses)).
Allowlist exactly those, so the database is reachable from Render and nowhere
else.

**Get the ranges from Render first:**

1. Open [your service](https://dashboard.render.com) — the service page, not the
   workspace home
2. Click **Connect** (upper right) → **Outbound** tab
3. Copy every CIDR range listed

**Then allowlist them in Atlas:**

4. Open [cloud.mongodb.com](https://cloud.mongodb.com). If you land on
   **All Projects**, that is the *organization* level — click the name of the
   project that holds your cluster first (see the warning below). You cannot
   reach Network Access from the organization level.
5. In the left sidebar, under the **Security** heading, click **Network Access**
   (some newer console versions nest this as **Database & Network Access** —
   same page, same setting)
6. Click **Add IP Address**, top right
7. In the **IP Address or CIDR** field, type the range exactly as Render showed
   it, e.g. `216.24.60.0/24`. There is **no separate "CIDR" option to select** —
   a CIDR block goes in the same field as a plain IP address.
8. Add a comment (`render`) so future-you knows where it came from
9. Click **Confirm**. The entry appears as **Pending**, then flips to **Active**
   within a minute or two
10. Repeat steps 6–9 for each remaining range

> **The sidebar has no Security section?** You are at the **organization** level.
> Atlas shows only org-wide settings there (Identity & Access, Billing,
> Configurations). The `Security` group — and therefore Network Access — only
> appears once you are inside a **project**. Click a project name in the Project
> Name column to enter it.

> **The IP access list is per project, not per organization.** Adding ranges to
> the wrong project does nothing for your app. Identify the right project by
> checking which one contains your cluster: the connection string points at
> `cluster0.<shard>.mongodb.net`, so open each project and confirm the cluster's
> hostname matches. Do not guess from the project name alone.

> **Do not click "Add Current IP Address".** It is the most prominent option in
> the dialog, but it allowlists *your laptop* — which is already allowed and does
> nothing for Render. Every range has to be typed in by hand.

> **If the Outbound tab is missing in Render:** you are probably on the workspace
> home page. If your workspace was created before 23 January 2022 *and* the
> service is in Oregon, it genuinely has no fixed ranges — use `0.0.0.0/0` in
> that case only.

Atlas calls this the **IP access list**; older docs and error messages say "IP
whitelist". Same thing. Entries accept both single IPs and CIDR ranges, apply to
every cluster in the project, and require the **Project Owner** or **Project
Network Access Manager** role.

**Why this matters:** `0.0.0.0/0` would mean "any host on the internet may attempt
a connection". It is survivable because the database still requires a username
and password, but listing Render's ranges is strictly better and just as easy.
Only reach for `0.0.0.0/0` if the ranges are genuinely unavailable to you.

**Skip this step and the deploy will fail** with the whitelist error — this is
the most common deploy failure for this project by a wide margin.

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

**Deploy fails: `Could not connect to any servers in your MongoDB Atlas cluster`**
The Atlas IP allowlist. See "If your deploy already failed" at the top of this
document. This is the most common deploy failure by a wide margin.

**Deploy fails: `bad auth : Authentication failed`**
Different problem, same symptom shape — the password is wrong. Check the
database user password inside `MONGODB_URI`, and URL-encode it if it contains
`@ : /` or `#`. If you changed the password in Atlas, update the variable in
Render and redeploy.

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

**The `[db]` error output is now specific**
`server/src/config/db.js` classifies the failure and prints the matching fix, so
the last lines of a failed boot name the actual cause instead of listing three
possibilities. Read the `Cause:` and `Fix:` lines before anything else.

**Deploy succeeds, then the site is slow for the first request**
Render's free tier sleeps after ~15 minutes idle and cold-starts in 30–60
seconds. This is expected, not a bug.

**Images work, then 404 after a while**
That is the ephemeral filesystem. See "Persisting uploads" above.

**`npm test` fails in CI**
Not part of the deploy. Tests need `mongodb-memory-server`, which downloads a
`mongod` binary (~100 MB) on first run, and the build sandbox may block that.
Run them locally instead.
