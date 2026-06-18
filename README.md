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
      index.js          app entry, runs migrations, mounts routes, serves client/
      db.js             pg Pool + per-user schema name helper
      runMigrations.js  applies every sql/*.sql file in order (called on boot and by migrate.js)
      migrate.js        CLI wrapper around runMigrations() for manual use
      middleware/auth.js  JWT verification
      routes/
        auth.js          signup / login / me
        query.js         POST /api/query — executes arbitrary SQL, scoped to the user's schema
        schema.js        GET /api/schema — table/column introspection for the sidebar
        datasources.js   CSV upload -> real Postgres table, list/delete/download as CSV
        widgets.js       CRUD + rename for saved dashboard widgets (name + chart type + SQL)
        savedQueries.js  CRUD for saved queries (name + SQL text, reloadable from the sidebar)
        nlToSql.js       POST /api/nl-to-sql — turns an English prompt into a SQL statement via GitHub Models
        nlToChart.js     POST /api/nl-to-chart — turns an English prompt into a SELECT + a suggested chart type/columns/agg
      llm.js             shared GitHub Models client + schema-description + SQL-validation helpers used by both nlTo* routes
      sql/
        001_init.sql           app_users / widgets / datasources tables + demo schema seed data
        002_saved_queries.sql  saved_queries table
        003_widget_agg.sql     widgets.agg column (count/sum/avg/min/max)
        004_widget_data.sql    widgets.data column (JSONB snapshot of the query result at save time)
  client/
    index.html
    css/styles.css
    js/
      icons.js    inline SVG icon strings
      api.js      fetch wrapper (adds Authorization header, base path /api)
      state.js    in-memory UI state object
      render.js   all render*() functions (auth screen, sidebar, builder, dashboard, modal, chart)
      actions.js  event handlers (auth, query run, CSV upload, widget/query CRUD) — exposed on window
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
npm start                # serves API + the client/ folder on http://localhost:4000
```

The server applies all `sql/*.sql` migrations automatically on every boot
(they're idempotent), so you don't need a separate migrate step or shell
access to the host — this matters on platforms like Render's free tier,
which doesn't include a Shell tab. `npm run migrate` still exists if you want
to apply migrations manually without starting the server.

### 3. Open the app

Visit `http://localhost:4000`, create an account, and start querying. The
sidebar schema panel and "Data sources" page show the shared `demo` tables
plus anything you upload as CSV.

### 4. (Optional) Enable the AI Assistant

There's a dedicated "AI Assistant" page (separate from the Query builder) with
a box where you type a request in plain English. It calls
[GitHub Models](https://github.com/marketplace/models), a free, rate-limited
inference API — not GitHub Copilot itself, which has no public API for this
kind of integration. Two buttons there do different things:

- **Generate SQL** — writes any single PostgreSQL statement (SELECT, INSERT,
  UPDATE, DELETE, CREATE TABLE, etc.) and only fills the SQL editor on the
  Query builder page. **It never executes automatically**: you review it and
  explicitly click Run, and the same schema-isolation and single-statement
  checks in `routes/query.js` still apply at execution time no matter how the
  SQL got into the editor (typed or generated). A generated query can still
  modify or delete your own data, so read it before running it.
- **Generate Chart** — designs an entire dashboard widget: it writes a
  read-only SELECT (enforced server-side in `routes/nlToChart.js` — non-SELECT
  output is rejected), runs it, and also picks a chart type plus label/value
  columns and an aggregation function. It then opens the "Save as widget"
  dialog with all of that pre-filled and a live chart preview, so you can
  review, tweak, or override any of it before clicking "Add to dashboard" —
  nothing is added to the dashboard without that explicit confirmation.

To enable both:

1. Go to GitHub → Settings → Developer settings → Personal access tokens →
   generate a token with read access to GitHub Models (the exact scope name
   may vary — check the current GitHub Models docs, since GitHub has changed
   this a few times).
2. Set it as `GITHUB_TOKEN` in `server/.env`.
3. Restart the server.

Everything else in the app works without this — it's an optional add-on. If
`GITHUB_TOKEN` isn't set, both features return a clear "not configured" error
instead of breaking anything else.

## Notable behavior changes vs. the original single-file prototype

- SQL now runs against real PostgreSQL instead of an in-browser SQLite (sql.js) instance.
- CSV upload is parsed and loaded server-side into the uploader's own schema, instead of client-side into in-memory SQLite — uploaded tables persist across sessions/restarts, and can be re-downloaded as CSV from the Data Sources page.
- Dashboard widgets persist in Postgres as a snapshot of the table produced by the query at save time (`widgets.data`, a JSONB column) — opening the Dashboard tab renders straight from that snapshot instead of re-running the query. The original SQL is still stored alongside it (`sql_text`) so the explicit Refresh button and auto-refresh can re-run it on demand to pull live data. Widgets can be renamed in place from the dashboard.
- Queries can be saved independently of widgets (sidebar → "Saved queries") and reloaded into the editor later. Saving a query as a widget clears the editor afterward so the next query starts fresh.
- The old "REST API endpoint" and "Database via backend proxy" data-source options were removed — the app itself is now that backend, talking to a real database directly.
- Multi-user accounts (signup/login) were added; each account's tables, widgets, and saved queries are private to that account.
- The English-to-SQL box moved off the Query builder page into its own "AI Assistant" page, and gained a second mode ("Generate Chart") that designs a full widget — SQL, chart type, label/value columns, and aggregation — instead of only the SQL text.
