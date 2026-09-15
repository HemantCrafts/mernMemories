# MERN Memories — Full-Stack Social Media Application
## Application-Link : https://mern-memories-j7f2.onrender.com/

A complete social feed application built on the **MERN stack**:

| Layer | Technology |
| --- | --- |
| **M**ongoDB | MongoDB Atlas (free tier) + Mongoose ODM |
| **E**xpress | Express 4 REST API |
| **R**eact | React 18 + Vite + React Router + Redux Toolkit + Redux Persist + Tailwind CSS |
| **N**ode | Node.js 18+ with ES modules |

## Features

- **Authentication** — register, login, JWT sessions, bcrypt password hashing (12 rounds), rate-limited auth endpoints
- **Posts** — create, edit, delete, 560-character limit, optional image attachment
- **Image uploads** — real file uploads processed through `sharp`: magic-byte validation, metadata/EXIF stripping, automatic resizing, server-generated filenames
- **Likes** — toggle like/unlike with optimistic UI updates
- **Comments** — add and delete comments, with author and post-owner moderation
- **Following** — follow/unfollow users, personal "Following" feed
- **Profiles** — bio, uploaded avatar, follower/following counts, post history
- **Explore** — debounced user search by username or display name
- **Feed** — infinite scroll pagination, "Everyone" / "Following" scopes
- **Light / dark mode** — three-state toggle (light → dark → system) driven by a Redux Toolkit slice, applied via `<html class="dark">`, persisted across reloads with Redux Persist
- **Route-level code splitting** — every page is `React.lazy()`-loaded behind a shared `<Suspense>` boundary, emitting one chunk per route
- **Session persistence** — refresh the page and stay logged in; the JWT is re-validated against `/auth/me` on boot
- **Orphaned-file cleanup** — deleting a post releases its image immediately; a dry-run-by-default sweep CLI reclaims anything left behind
- **142 integration tests** — auth, posts, comments, follows, ownership guards, rate limiting, upload security, and cleanup safety

---

## Two ways to get a database

You need a MongoDB before the server will boot. Pick one:

| Option | Best for | Setup |
| --- | --- | --- |
| **A. MongoDB Atlas** | Realistic cloud setup, no local install | Steps 1 below |
| **B. Docker (local)** | Fast iteration, offline work, throwaway data | Steps 1b below |

Both work with the same code — only `MONGODB_URI` changes.

---

## Prerequisites

- **Node.js 18 or newer** — [nodejs.org](https://nodejs.org)
- **A MongoDB Atlas account** (free) *or* **Docker Desktop**
- **Git** (optional)

Verify your Node version:

```bash
node --version   # should print v18.x or higher
```

---

## Step 1 — Set up MongoDB Atlas (free tier)

This is the only step that requires a browser.

1. **Create an account / cluster**
   - Go to <https://cloud.mongodb.com> and sign up (free).
   - Choose **Build a Database** → **M0 FREE** tier.
   - Pick any cloud provider and a region physically near you.
   - Name the cluster (e.g. `Cluster0`) and click **Create**.

2. **Create a database user**
   - In the left sidebar: **Security → Database Access** → **Add New Database User**.
   - Choose **Password** authentication.
   - Set a username (e.g. `mernmemories`) and a strong password.
   - ⚠️ **Write down this password.** You cannot view it again later.
   - Under *Database User Privileges* leave it as **Read and write to any database**.
   - Click **Add User**.

3. **Allow your IP address**
   - In the left sidebar: **Security → Network Access** → **Add IP Address**.
   - Click **Add Current IP Address** (recommended).
   - For development only, you may use `0.0.0.0/0` to allow any IP — but **never** do this for anything public.
   - Click **Confirm**.

4. **Copy the connection string**
   - Go back to **Database → Clusters** → click **Connect** on your cluster.
   - Choose **Drivers**.
   - Copy the string. It looks like:
     ```
     mongodb+srv://mernmemories:<password>@cluster0.abcde.mongodb.net/?retryWrites=true&w=majority
     ```
   - Replace `<password>` with the real password.
   - Add the database name `socialapp` before the `?`:
     ```
     mongodb+srv://mernmemories:YourRealPassword@cluster0.abcde.mongodb.net/socialapp?retryWrites=true&w=majority
     ```

   > **If your password contains `@`, `:`, `/`, `#` or `?`** you must URL-encode it
   > (`@` → `%40`, `:` → `%3A`, `/` → `%2F`, `#` → `%23`). Otherwise the URI will
   > misparse and the connection will fail.

---

## Step 1b — Or run MongoDB locally with Docker

Skip Atlas entirely if you prefer containers. Requires Docker Desktop.

```bash
npm run db:up
```

This starts:

- **MongoDB 7** on `localhost:27017` (user `mernmemories`, password `mernmemories_dev_password`)
- **mongo-express** web UI on <http://localhost:8081> for browsing collections

Then in `server/.env` use:

```env
MONGODB_URI=mongodb://mernmemories:mernmemories_dev_password@localhost:27017/socialapp?authSource=admin
```

Useful commands:

```bash
npm run db:up      # start containers in the background
npm run db:down    # stop (data volume is preserved)
```

> ⚠️ To wipe all local data: `docker compose down -v`. That deletes the volume
> permanently.
>
> **These credentials are for local development only.** They're committed to the
> repo on purpose so `npm run db:up` works with zero configuration — never reuse
> them anywhere reachable from the internet.
>
> Note: the compose file was authored without Docker available to test it. It
> follows the official `mongo` and `mongo-express` image docs but has not been
> executed here — run `docker compose config` to validate before relying on it.

---

## Step 2 — Configure the server

From the project root:

```bash
cd server
cp .env.example .env
```

Open `server/.env` and fill it in (Atlas example shown):

```env
PORT=5000
NODE_ENV=development

MONGODB_URI=mongodb+srv://mernmemories:YourRealPassword@cluster0.abcde.mongodb.net/socialapp?retryWrites=true&w=majority

JWT_SECRET=replace_me_with_a_long_random_string
JWT_EXPIRES_IN=7d

CLIENT_ORIGIN=http://localhost:5173,http://127.0.0.1:5173
```

Generate a proper JWT secret with:

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

The server validates this file on boot and exits with a clear message if
`MONGODB_URI` or `JWT_SECRET` is missing — so a typo won't turn into a
confusing crash later.

---

## Step 3 — Install dependencies

From the **project root** (installs root, server and client in one go):

```bash
npm run install:all
```

Or manually:

```bash
npm install && npm --prefix server install && npm --prefix client install
```

---

## Step 4 — Seed the database (recommended)

This creates four demo users, eight posts, comments, likes and follow
relationships so the app isn't empty on first load.

```bash
npm run seed
```

> ⚠️ The seed script **clears** the `users`, `posts` and `comments`
> collections first. Don't run it against a database you care about.

**Demo accounts — password for all of them is `Password123!`**

| Username | Email |
| --- | --- |
| `ada` | ada@example.com |
| `linus` | linus@example.com |
| `grace` | grace@example.com |
| `margaret` | margaret@example.com |

---

## Step 5 — Run it

```bash
npm run dev
```

This starts both processes together:

- **API** → <http://localhost:5000/api>
- **Client** → <http://localhost:5173>

Vite proxies `/api/*` to Express, so the browser sees a single origin and
you never have to think about CORS in development.

> **`localhost` and `127.0.0.1` are different origins.** A browser sends
> whichever one is in the address bar as the `Origin` header, so CORS must allow
> both. `CLIENT_ORIGIN` therefore lists both spellings, and any loopback origin
> is accepted in development regardless of port (so a shifted Vite port still
> works). Forgetting this produces `Origin not allowed by CORS:
> http://127.0.0.1:5173` on login even though the API is plainly reachable.

Open **<http://localhost:5173>** and log in with `ada` / `Password123!`.

To run the two halves separately:

```bash
npm run dev:server   # Express only
npm run dev:client   # Vite only
```

---

## Running the tests

```bash
npm test
```

**142 integration tests** run against an **in-memory MongoDB** — no Atlas
credentials, no Docker, no local Mongo install required. `mongodb-memory-server`
downloads and boots a real `mongod` binary the first time, then reuses it.

Coverage:

| File | What it covers |
| --- | --- |
| `tests/auth.test.js` | register, login (username + email), `/me`, duplicate handling, validation, password-hash leakage, no user enumeration |
| `tests/posts.test.js` | post CRUD, ownership guards (403), pagination, author filter, following feed, like toggle, per-viewer like state, cascade delete |
| `tests/comments.test.js` | add/list/delete, author + post-owner moderation (403 for third parties), commentCount sync, never below zero |
| `tests/users.test.js` | profiles, search (incl. regex-metacharacter safety), profile updates, field-allowlist protection, follow/unfollow both directions, self-follow rejection |
| `tests/uploads.test.js` | **upload security** — spoofed mimetypes, polyglot files, SVG, path traversal, EXIF/GPS stripping, size limits, filename generation, URL-injection rejection |
| `tests/rate-limit.test.js` | the auth limiter actually returns 429 with RateLimit headers |
| `tests/cleanup.test.js` | orphan detection, grace-period protection, dry-run default, reference counting across posts *and* avatars, in-flight-upload safety |

> The rate limiter is **disabled when `NODE_ENV=test`** so it doesn't throttle
> the suite's own setup calls. `rate-limit.test.js` covers the real production
> behaviour separately, so disabling it doesn't create a blind spot.

Watch mode:

```bash
npm --prefix server run test:watch
```

---

## How image uploads work

Images are **uploaded, not linked**. Both posts and profiles accept only files
this server has processed — arbitrary remote URLs are rejected outright.

### Why

The original design let clients supply any `imageUrl`. Rendering an
attacker-chosen URL inside `<img src>` enables tracking pixels, mixed content,
and `data:`/`javascript:` URI abuse. The fix isn't stricter URL validation —
it's removing the ability to name arbitrary URLs at all.

### The pipeline

```
client picks a file
   │
   ├─ multer (memory storage, 5 MB cap)      ← nothing touches disk yet
   │
   ├─ magic-byte inspection                  ← the declared mimetype is IGNORED
   │     JPEG / PNG / WebP / GIF only
   │
   ├─ sharp: decode → re-encode              ← metadata discarded, pixels rebuilt
   │     • EXIF/GPS/ICC stripped
   │     • auto-rotated using EXIF before it's dropped
   │     • resized to fit 1600px (never upscaled)
   │     • rejects >50 MP decompression bombs
   │
   ├─ server-generated filename              ← client filename never used
   │     <timestamp>-<128-bit random>.<ext>
   │
   └─ written to server/uploads/ (mode 0644)
```

Re-encoding is the load-bearing step. A **polyglot** file — one that's
simultaneously a valid JPEG *and* valid HTML — cannot survive it, because the
original bytes are never copied through. The output is built pixel by pixel.

### Serving

`/uploads/<file>` is served with a forced `Content-Type`, plus
`X-Content-Type-Options: nosniff` and a restrictive CSP. Even if a
non-image somehow reached the directory, the browser would not execute it.

### Endpoints

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/uploads` | ✅ | `multipart/form-data`, field name `image`. Returns `{ url, filename, size, format, width, height }` |

Pass the returned `url` as `imageUrl` (on a post) or `avatarUrl` (on your
profile). Anything that isn't a `/uploads/...` path is rejected with 400.

### Configuration

| Env var | Default | Purpose |
| --- | --- | --- |
| `UPLOAD_DIR` | `server/uploads` | Where processed images are written |
| `MAX_UPLOAD_BYTES` | `5242880` (5 MB) | Per-file size cap |

> **On disk storage:** files live on the local filesystem, so they don't
> survive a redeploy on an ephemeral platform (Heroku, most container hosts).
> For real deployment, either mount a persistent volume or swap
> `imageService.js` for an object-store driver — the interface is a single
> `processAndStoreImage(buffer, dir)` call, so the swap is contained.

---

## Orphaned uploads

An image becomes an **orphan** when nothing references it any more. There are
two ways that happens:

1. **A post is deleted.** Handled instantly — see below.
2. **The post is edited** to remove or replace its `imageUrl`. The old file is
   left on disk.

Left alone, these accumulate silently. There are two mechanisms to deal with
them.

### Immediate release on delete

When a post is deleted, the handler captures its `imageUrl` *before* the
document is removed, then calls `releaseImageIfUnreferenced()`:

```js
const orphanedImage = post.imageUrl;
await Promise.all([Comment.deleteMany({ post: post._id }), post.deleteOne()]);
if (orphanedImage) {
  const release = releaseImageIfUnreferenced(orphanedImage, uploadDir).catch(() => {});
  if (awaitCleanup) await release; else release;   // awaited only under test
}
```

The check is deliberately a **`User.exists({ avatarUrl })` query as well as a
`Post.exists({ imageUrl })` query**. A user can legitimately point their avatar
at the same path, so a reference-count of zero is required before anything is
unlinked. Without that second query, deleting a post could delete someone's
profile picture.

The cleanup is fire-and-forget in production — a failed unlink must never fail
the user's delete request. Tests inject `awaitCleanup: true` so assertions
can't race the background work.

### The sweep CLI

For everything the delete path can't catch (edits, crashes, manual file drops):

```bash
npm run cleanup:uploads                # preview — deletes nothing
npm run cleanup:uploads -- --apply     # actually delete
npm run cleanup:uploads -- --grace=5   # protect files newer than 5 minutes
npm run cleanup:help                   # usage text (works with no .env)
```

**Dry-run is the default.** You must pass `--apply` to delete anything. The
output lists every file it would remove, so the destructive step is always
reviewed first.

> **npm swallows flags it recognises.** `npm run cleanup:uploads -- --help`
> prints npm's own help, not this script's, because `--help` is intercepted
> before it reaches Node. That's why `cleanup:help` exists as a dedicated
> script. If a flag ever seems to be ignored, call the script directly:
>
> ```bash
> node server/src/cleanup.js --apply
> ```
>
> The script parses its arguments *before* importing anything that needs
> credentials, so bad flags fail immediately instead of behind a confusing
> "missing MONGODB_URI" error.

### Why there's a grace period

Default is **60 minutes** (`--grace=<minutes>` to change it). This exists to
close a genuine race:

> A user uploads an image → the file lands on disk → *they haven't hit Post
> yet* → a sweep runs.

At that moment the file is referenced by nothing, so a reference-counting
sweeper sees a perfect orphan. It would delete an image the user is still
composing. Files younger than the grace period are therefore never touched,
because **an in-flight upload is indistinguishable from an orphan by reference
count alone.** The grace period is the only thing separating them.

Lower it deliberately. Setting `--grace=0` makes the race real.

### What counts as a reference

The sweeper scans `Post.imageUrl` and `User.avatarUrl` across the whole
collection, builds the set of referenced filenames, and diffs it against a
directory listing of `UPLOAD_DIR`. Comparison is by **basename**, so a stored
path and a bare filename resolve to the same entry.

`.gitkeep` is always preserved.

---

## Available scripts

Run from the project root:

| Script | What it does |
| --- | --- |
| `npm run dev` | Runs API + client concurrently |
| `npm run dev:server` | Express with `--watch` (auto-restart on save) |
| `npm run dev:client` | Vite dev server with HMR |
| `npm run install:all` | Installs all three package trees |
| `npm run seed` | Wipes and reseeds the database |
| `npm run cleanup:uploads` | Previews orphaned image files (add `-- --apply` to delete) |
| `npm run cleanup:help` | Prints cleanup usage — works without a configured `.env` |
| `npm test` | Runs the backend test suite |
| `npm run build` | Production build of the React app → `client/dist` |
| `npm start` | Runs the server in production mode (serves the built client) |
| `npm run db:up` | Starts local MongoDB + web UI via Docker |
| `npm run db:down` | Stops the local Docker containers |

---

## Production build

```bash
npm run build   # builds client/dist
npm start       # Express serves the API *and* the static client
```

With `NODE_ENV=production`, Express serves `client/dist` and falls back to
`index.html` for client-side routes, so the whole app runs from one port.

### The app refuses to start on an unsafe production config

`server/src/config/env.js` validates the environment before the server binds,
so a misconfiguration fails loudly at deploy time instead of silently at
runtime:

| Condition | Result |
| --- | --- |
| `JWT_SECRET` missing, a placeholder, or under 32 chars | **Exits** — a weak secret lets anyone forge a JWT |
| `CLIENT_ORIGIN` unset | **Exits** — an empty allowlist rejects every browser request |
| `server/.env` present | **Ignored** — in production only the platform's env vars count |

That last row matters: `.env` is read *only* when `NODE_ENV` is not
`production`. On a host, a leftover `.env` containing a `localhost` origin
would otherwise silently override the real one and break CORS on the live site.

---

## Deploying

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for a step-by-step Render walkthrough.

Two files support it:

| File | Purpose |
| --- | --- |
| `render.yaml` | Render Blueprint — build command, start command, health check, env vars |
| `Dockerfile` | Multi-stage production image (client build → server deps → slim runtime), usable on any Docker host |

Both assume the single-process model above: one Node process serves the API
and the built React app.

**Two deployment constraints to be aware of:**

1. **MongoDB is external.** No PaaS sandbox provides it, so the app keeps using
   MongoDB Atlas. The host must be able to reach it, which means allowing
   `0.0.0.0/0` in Atlas Network Access (the credentials still protect it).
2. **Uploads need a persistent disk.** Without one the filesystem is ephemeral
   and uploaded images are lost on restart. Text data in Atlas is unaffected.
   `render.yaml` documents the disk block; the alternative is a pluggable
   storage driver (S3/Cloudinary), which is not built yet.

> The `Dockerfile` was authored without Docker installed on the development
> machine, so its image has not been built here. The build and start commands
> it encodes were verified directly, and `docker build` should be run once
> before relying on it.

---

## API reference

All responses are JSON. Authenticated routes expect
`Authorization: Bearer <token>`.

### Auth — `/api/auth`

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/register` | — | Create an account, returns `{ token, user }` |
| `POST` | `/login` | — | Log in with `identifier` (username *or* email) + `password` |
| `GET` | `/me` | ✅ | Current user — used to restore a session on refresh |

### Posts — `/api/posts`

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/` | optional | Paginated feed. Query: `?page`, `?author=<id>`, `?feed=following` |
| `GET` | `/:id` | optional | Single post with its comments |
| `POST` | `/` | ✅ | Create a post `{ content, imageUrl? }` — `imageUrl` must be an `/uploads/...` path |
| `PATCH` | `/:id` | ✅ | Edit your own post |
| `DELETE` | `/:id` | ✅ | Delete your own post (cascades comments) |
| `POST` | `/:id/like` | ✅ | Toggle like → `{ liked, likeCount }` |
| `GET` | `/:id/comments` | — | List comments |
| `POST` | `/:id/comments` | ✅ | Add a comment `{ content }` |
| `DELETE` | `/:postId/comments/:commentId` | ✅ | Delete a comment (author or post owner) |

### Uploads — `/api/uploads`

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/` | ✅ | `multipart/form-data`, field `image`. Returns `{ url, filename, size, format, width, height }` |

### Users — `/api/users`

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/` | optional | List/search users. Query: `?q`, `?page` |
| `GET` | `/:username` | optional | Public profile + post count |
| `PATCH` | `/me` | ✅ | Update `displayName`, `bio`, `avatarUrl` — `avatarUrl` must be an `/uploads/...` path |
| `POST` | `/:id/follow` | ✅ | Toggle follow → `{ following, followerCount }` |

### Health

| Method | Endpoint | Description |
| --- | --- | --- |
| `GET` | `/api/health` | `{ status, env, uptime, timestamp }` |

---

## Project structure

```
social media App/
├── package.json              # root: concurrently dev script + shortcuts
├── docker-compose.yml        # optional local MongoDB + web UI
├── .dockerignore
├── README.md
│
├── server/                   # ── Express + MongoDB ──
│   ├── .env.example
│   ├── package.json
│   ├── src/
│   │   ├── server.js         # entry point, graceful shutdown
│   │   ├── app.js            # express app, CORS, routes, static, errors
│   │   ├── seed.js           # demo data seeder
│   │   ├── cleanup.js        # sweep CLI for orphaned uploads (dry-run default)
│   │   ├── config/
│   │   │   ├── env.js        # env loading + validation
│   │   │   └── db.js         # Atlas connection with retry
│   │   ├── models/
│   │   │   ├── User.js       # bcrypt hooks, toPublicProfile()
│   │   │   ├── Post.js       # toClient(viewerId) adds likedByViewer
│   │   │   └── Comment.js
│   │   ├── middleware/
│   │   │   ├── auth.js       # requireAuth + optionalAuth
│   │   │   └── errorHandler.js
│   │   ├── services/
│   │   │   ├── imageService.js    # validate, re-encode, store uploads
│   │   │   └── cleanupService.js  # orphan detection + safe release
│   │   ├── routes/
│   │   │   ├── auth.routes.js
│   │   │   ├── posts.routes.js    # factory: uploadDir + awaitCleanup injected
│   │   │   ├── users.routes.js
│   │   │   └── uploads.routes.js  # factory: uploadDir injected
│   │   └── utils/
│   │       ├── ApiError.js
│   │       └── sanitizeImageUrl.js
│   ├── uploads/              # processed images (gitignored)
│   └── tests/                # 142 integration tests (in-memory MongoDB)
│       ├── setup.js          # shared harness: DB, app, helpers
│       ├── auth.test.js
│       ├── posts.test.js
│       ├── comments.test.js
│       ├── users.test.js
│       ├── uploads.test.js
│       ├── cleanup.test.js
│       └── rate-limit.test.js
│
└── client/                   # ── React + Redux Toolkit + Tailwind ──
    ├── index.html
    ├── vite.config.js        # dev proxy /api + /uploads -> :5000
    ├── tailwind.config.js    # darkMode: 'class' + custom `ink` surface ramp
    └── src/
        ├── main.jsx          # Provider > PersistGate > Router
        ├── App.jsx           # lazy routes + Suspense + RequireAuth guard
        ├── index.css         # Tailwind layers + component classes (light/dark)
        ├── api/
        │   ├── client.js     # axios instance + JWT interceptor
        │   └── endpoints.js  # typed-ish API wrappers
        ├── store/
        │   ├── index.js      # configureStore, persistReducer, theme side-effects
        │   ├── hooks.js      # useAuth(), useTheme()
        │   └── slices/
        │       ├── authSlice.js   # bootstrapSession, login, register, logout
        │       └── themeSlice.js  # light / dark / system preference
        ├── components/
        │   ├── Navbar.jsx
        │   ├── PostCard.jsx
        │   ├── Composer.jsx
        │   ├── ImageUploader.jsx  # file picker + preview + progress
        │   ├── Avatar.jsx
        │   └── Feedback.jsx  # Spinner, PageLoader, EmptyState, ErrorBanner
        ├── pages/
        │   ├── Feed.jsx
        │   ├── Login.jsx
        │   ├── Register.jsx
        │   ├── Explore.jsx
        │   ├── Profile.jsx
        │   ├── PostDetail.jsx
        │   └── Settings.jsx
        └── utils/
            └── format.js     # timeAgo, initials, avatar colors
```

---

## How state management works

Redux Toolkit owns cross-cutting client state; `redux-persist` keeps the theme
choice across reloads.

| Slice | Holds | Persisted? |
| --- | --- | --- |
| `auth` | `user`, `booting`, `submitting`, `error` | **No** — see below |
| `theme` | `preference` (light/dark/system), `theme` (resolved) | **Yes**, via `whitelist: ['theme']` |

**Why auth is not persisted.** The JWT lives in `localStorage` under
`mernmemories.token` and is read by the axios interceptor. Persisting the `user`
object as well would let a stale profile flash on screen after the token had
already expired. Instead `bootstrapSession` re-validates against
`GET /api/auth/me` on boot and clears the token if that call fails.

The theme is a three-state preference rather than a boolean. `cycleTheme`
rotates **light → dark → system**; on `system` the slice follows the OS via
`matchMedia('(prefers-color-scheme: dark)')` and re-resolves when the OS
setting flips mid-session. The resolved value is applied to
`<html class="dark">`, which is what Tailwind's `darkMode: 'class'` keys off.
A `store.subscribe` listener pushes theme changes to the DOM, and the
preference is mirrored to `localStorage` so it survives a hard reload even
before rehydration completes.

**Code splitting.** Every route is loaded with `React.lazy()` behind a single
`<Suspense>` boundary, so the initial bundle carries only the shell, navbar and
shared components. The production build emits one chunk per page:

```
dist/assets/index-*.js          271.88 kB │ gzip: 92.00 kB   # shell + vendor
dist/assets/Feed-*.js             6.04 kB │ gzip:  2.58 kB
dist/assets/PostDetail-*.js       4.41 kB │ gzip:  1.89 kB
dist/assets/Register-*.js         3.89 kB │ gzip:  1.43 kB
dist/assets/PostCard-*.js         3.72 kB │ gzip:  1.43 kB
dist/assets/Profile-*.js          3.71 kB │ gzip:  1.59 kB
dist/assets/Settings-*.js         3.44 kB │ gzip:  1.40 kB
dist/assets/Explore-*.js          3.00 kB │ gzip:  1.39 kB
dist/assets/Login-*.js            2.81 kB │ gzip:  1.14 kB
dist/assets/ImageUploader-*.js    2.41 kB │ gzip:  1.19 kB
```

---

## How authentication works

1. `POST /api/auth/register` or `/login` returns a signed JWT (`sub` = user id, 7-day expiry).
2. The client stores it in `localStorage` under `mernmemories.token`.
3. An axios request interceptor attaches `Authorization: Bearer <token>` to every call.
4. A response interceptor catches `401`s, clears the token, and dispatches a
   `mernmemories:unauthorized` event. The store listens for that event and
   dispatches `logout`, so Redux state clears and the UI drops to the
   signed-out view immediately.
   The interceptor cannot dispatch directly without a circular import, which is
   why it goes through a DOM event and the store does the listening.
5. On app boot, `bootstrapSession` calls `GET /api/auth/me` to validate any
   stored token and restore the session.

Passwords are hashed with bcrypt in a Mongoose `pre('save')` hook, and the
`password` field is `select: false` so it can never leak into a JSON response
by accident.

---

## Troubleshooting

**`MongooseServerSelectionError` / connection timeout**
Almost always the Atlas IP allowlist. Go to **Network Access** and add your
current IP. Free clusters also spin down when idle — the first request after a
long pause can take a few seconds; the server retries three times automatically.

**`MongoServerError: bad auth : Authentication failed`**
The password in `MONGODB_URI` is wrong, or it contains special characters that
weren't URL-encoded. See the note in Step 1.

**`[config] MONGODB_URI still contains the placeholder <username>`**
You haven't replaced the placeholder in `server/.env` yet.

**Client shows "Cannot reach the server. Is the backend running on port 5000?"**
The Express process isn't up. Run `npm run dev` (both) or `npm run dev:server`,
and confirm <http://localhost:5000/api/health> responds.

**`EADDRINUSE` on port 5000 or 5173**
Another process holds the port. Change `PORT` in `server/.env`, and
`server.port` in `client/vite.config.js` (plus the proxy target). Any loopback
port is accepted by CORS in development, so no `CLIENT_ORIGIN` change is needed.

**Login shows `Origin not allowed by CORS: http://127.0.0.1:5173`**
The app was opened as `127.0.0.1` but only `localhost` was allowlisted. Both
spellings ship in `CLIENT_ORIGIN` by default; if you edited that value, list
both, comma-separated. Verify with:

```bash
node -e "fetch('http://127.0.0.1:5000/api/health',{headers:{Origin:'http://127.0.0.1:5173'}}).then(r=>console.log(r.status, r.headers.get('access-control-allow-origin')))"
```

**`http://127.0.0.1:5173` refuses to connect but `localhost:5173` works**
Vite bound to IPv6 `::1` only. `client/vite.config.js` pins
`host: '127.0.0.1'` to avoid this; keep it if you change the config.

**401 immediately after logging in**
`JWT_SECRET` changed while an old token was still in `localStorage`.
Clear site data for `localhost:5173` and log in again.

**`npm test` fails on first run while downloading a MongoDB binary**
`mongodb-memory-server` fetches a real `mongod` binary on first use
(~100 MB), then caches it. A slow or blocked connection will time out. It's
cached in the OS temp directory, so subsequent runs are offline and fast.
If your network blocks it, set `MONGOMS_SYSTEM_BINARY` to a local `mongod`
path, or fall back to Docker/Atlas and test against those manually.

**Tests pass individually but fail together**
Each test file boots its own in-memory Mongo instance. If they're sharing
state, confirm `clearDatabase()` is wired into `beforeEach` in that file.

**Uploads succeed but images show as broken**
Check both dev servers are running — Vite proxies `/uploads` to Express, so a
stopped backend breaks images even though the upload itself succeeded. In
production, confirm `server/uploads/` exists and is writable, and that
`UPLOAD_DIR` points where you think it does.

**"Unsupported file type" when the file is clearly an image**
The server validates magic bytes, not the extension or the declared mimetype.
A file renamed from `.txt` to `.png`, a truncated download, or an editor that
saved a non-standard header will all be rejected. Confirm the file opens
correctly in an image viewer.

**Uploads vanish after a redeploy**
Files are stored on local disk. Ephemeral hosts (Heroku, most container
platforms) discard them on every deploy. Mount a persistent volume, or swap
`imageService.js` for object storage.

---

## Security notes for going beyond local development

This is a solid development baseline, not a hardened production deployment.
The test suite covers the behaviours marked ✅ below; the rest are known gaps.

**Already handled**

- ✅ Passwords hashed with bcrypt (12 rounds), `password` is `select: false` and stripped in `toJSON` — verified by a test asserting no hash appears in any response
- ✅ Login returns an identical message for wrong-password and unknown-user, so accounts can't be enumerated
- ✅ Auth endpoints are rate limited (20 requests / 15 min) — verified in `rate-limit.test.js`
- ✅ Search input is regex-escaped, so `.*` matches literally instead of matching everything (blocks a ReDoS / wildcard-scan vector)
- ✅ `PATCH /api/users/me` uses a field allowlist — attempts to set `username`, `email` or `followers` are ignored, verified against the database not just the response
- ✅ Ownership enforced on post edit/delete (403) and comment deletion (author or post owner only)
- ✅ Even a rejected CORS origin returns a clean 403 with no stack trace
- ✅ **Uploads are hardened** — magic-byte validation (declared mimetype ignored), re-encoding through sharp which strips EXIF/GPS and defeats polyglot files, server-generated filenames (no traversal possible), 5 MB and 50 MP caps, and served with `nosniff` + a restrictive CSP
- ✅ **Orphaned uploads are reclaimed** — post deletion releases its image only
  after confirming no other post *or* avatar still references it; leftover files
  are found by `npm run cleanup:uploads`, which defaults to a dry run and
  protects anything younger than a 60-minute grace period
- ✅ **Arbitrary remote image URLs are rejected** — `imageUrl`/`avatarUrl` must be `/uploads/...` paths the server created. Blocks tracking pixels, mixed content, and `data:`/`javascript:` URI abuse

**Still to address before exposing publicly**

- **Uploads are stored on local disk.** They're now garbage-collected, but on an
  ephemeral host they still vanish on redeploy. Mount a persistent volume or move
  to object storage for real deployments.
- **No scheduled cleanup.** `cleanup:uploads` is manual. Wire it to cron or a
  scheduled job if you run this long-term — the grace period makes it safe to
  run concurrently with live traffic.
- **No email verification or password reset.** Add both before real users.
- **Tokens live in `localStorage`**, which is readable by any XSS. Consider an
  httpOnly refresh-cookie pattern with short-lived access tokens.
- **No refresh-token rotation**, so a stolen token is valid until it expires.
- **No virus scanning.** Re-encoding neutralizes executable payloads, but it is
  not an antivirus. High-assurance deployments should scan uploads too.
- **Rate limiting covers auth and upload routes only.** Add a general limiter
  (and `express-mongo-sanitize`) across the API.
- **`docker-compose.yml` contains a hardcoded dev password.** Fine for local
  work, never for anything reachable.
- **Add security headers** via `helmet`, and terminate TLS in front of the app.
- **Atlas network access** should be scoped to your deployment's egress IPs,
  never `0.0.0.0/0`.
- **No CI pipeline.** The test suite is ready to run in one — `npm test` needs
  no external services thanks to the in-memory database.

---


