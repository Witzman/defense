# Flow Defense

Browser tower defense, single player. Enemies are colored blobs that flow through
water from spawns to goals; turrets stand on islands.

Playable now: level 1 — place up to three turrets on land, start the run, win or lose.
A Node server serves the built game and stores the save game in Postgres, delivered
with Docker Compose.

## Code

| Where | What |
|---|---|
| `src/sim/` | deterministic simulation: seeded map generator, distance field, run rules (fixed step 1/30 s); no DOM, runs headless |
| `src/content/` | level data |
| `src/render/` | canvas view; reads the world, never changes it |
| `src/main.ts` | page: preparation, run loop, HUD |
| `server/` | HTTP server and Postgres store |

Under a path prefix (Dokploy domain with path `/defense` and Strip Path on) the page
works because every URL is relative; `/defense` redirects to `/defense/`.

## Run it

```sh
# whole stack, as deployed: http://localhost:3000
POSTGRES_PASSWORD=dev docker compose -f compose.yaml -f compose.local.yaml up --build
```

For development, run the stack (or only `db`) and start Vite with `npm run dev`;
it forwards `/api` and `/healthz` to the server on port 3000.

## Test

```sh
npm ci
npm run typecheck
npm test     # store tests need a THROWAWAY Postgres (they empty the table): set PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE
npm run build
```

## Deploy (Dokploy)

- Compose project from this repository, branch `main`, compose file `compose.yaml`.
- Environment: `POSTGRES_PASSWORD`. Postgres reads it only when the volume is first created;
  changing it later locks the app out until the password is changed inside the database too.
- Domain on service `app`, port `3000`.
- The save game lives in the volume `pgdata`; it survives redeploys.

## Server

| Path | |
|---|---|
| `GET /api/save` | the save game as JSON, `404` while there is none |
| `PUT /api/save` | stores a JSON object with an integer `version`, at most 5 MB |
| `GET /healthz` | `200` while the database answers, else `503` |
| everything else | the built game from `dist/` |

The prototype has one global save game (slot `global`). With login the slot becomes the user id.
