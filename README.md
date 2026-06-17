# Query Studio (full stack)

A SQL query builder + dashboard tool, rebuilt as a real client/server app:

- **Backend**: Node.js + Express + PostgreSQL (`server/`)
- **Frontend**: vanilla JS (ES modules), no build step (`client/`)
- **Auth**: email/password accounts, JWT bearer tokens
- **Data**: each account gets its own Postgres schema for uploaded CSV tables,
  plus shared read-only demo tables (`gnn_alerts`, `incidents`, `users`)

## Architecture

```
query-studio-fullstack/
  server/        Express API + static file server
    src/
      index.js          app entry, mounts routes, serves client/
      db.js             pg Pool + per-user schema name helper
      migrate.js         runs sql/001_init.sql
      middleware/auth.js  JWT verification
      routes/
        auth.js          signup / login / me
        query.js         POST /api/query — executes arbitrary SQL, scoped to the user's schema
        schema.js        GET /api/schema — table/column introspection for the sidebar
        datasources.js   CSV upload -> real Postgres table, list/delete
        widgets.js       CRUD for saved dashboard widgets (name + chart type + SQL)
      sql/001_init.sql   app_users / widgets / datasources tables + demo schema seed data
  client/
    index.html
    css/styles.css
    js/
      icons.js    inline SVG icon strings
      api.js      fetch wrapper (adds Authorization header, base path /api)
      state.js    in-memory UI state object
      render.js   all render*() functions (auth screen, sidebar, builder, dashboard, modal, chart)
      actions.js  event handlers (auth, query run, CSV upload, widget CRUD) — exposed on window
      app.js      boots the app, wires actions to window for inline onclick handlers
```

## How SQL execution is sandboxed

Every account gets its own Postgres schema (`user_<id>`). When `/api/query` runs a
query it sets `search_path` to `"user_<id>", demo` for that connection, so `SELECT * FROM foo`
resolves to the caller's own table (or the shared demo table if they don't have one).

On top of that, `routes/query.js` rejects, before execution:
- multiple stacked statements (`;` other than a single trailing one)
- references to `pg_catalog`, `information_schema`, or any `pg_*` system table
- references to the `app_users` table
- references to another user's schema (`user_<other id>.…`)
- any non-`SELECT` statement that touches the shared `demo.` schema

This is app-level defense in depth, not a hardened multi-tenant sandbox — the
single Postgres role the server connects as still technically has full rights.
For a production deployment, pair this with a low-privilege DB role, query
timeouts (already set via `statement_timeout`), and row/byte caps (already
applied: 1000 rows max per response).

## Setup

### 1. PostgreSQL

Create a database (adjust name/credentials to taste):

```bash
createdb query_studio
```

### 2. Backend

```bash
cd server
cp .env.example .env     # then edit DATABASE_URL / JWT_SECRET
npm install
npm run migrate          # creates tables + seeds the demo schema
npm start                # serves API + the client/ folder on http://localhost:4000
```

### 3. Open the app

Visit `http://localhost:4000`, create an account, and start querying. The
sidebar schema panel and "Data sources" page show the shared `demo` tables
plus anything you upload as CSV.

## Notable behavior changes vs. the original single-file prototype

- SQL now runs against real PostgreSQL instead of an in-browser SQLite (sql.js) instance.
- CSV upload is parsed and loaded server-side into the uploader's own schema, instead of client-side into in-memory SQLite.
- Dashboard widgets persist in Postgres and re-run their saved SQL each time you open the Dashboard tab, so they always show live data.
- The old "REST API endpoint" and "Database via backend proxy" data-source options were removed — the app itself is now that backend, talking to a real database directly.
- Multi-user accounts (signup/login) were added; each account's tables and widgets are private to that account.
