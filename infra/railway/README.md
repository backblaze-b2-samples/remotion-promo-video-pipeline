# Railway Deployment

Deploy both services (web + api) on Railway.

> **The API service needs a render host, not just a Python host.** A render pass
> spawns Node (Remotion), which downloads Chrome Headless Shell on first use, and
> ffmpeg (bundled with `imageio-ffmpeg`). Give the API service Node.js >= 20 on
> `PATH`, outbound network for the one-time Chrome download, and enough ephemeral
> disk for one pass of frames (~2 GB for the `full` preset). Without Node the
> render routes return `503` with an actionable message; the rest of the app —
> browsing, the library, the bucket explorer — still works.

## Setup

1. Create a new Railway project
2. Add two services from the same repo:

### Web Service (Next.js)
- **Root Directory**: `apps/web`
- **Build Command**: `pnpm install && pnpm build`
- **Start Command**: `pnpm start`
- **Port**: `3000`

### API Service (FastAPI)
- **Root Directory**: repo root (the render CLI lives in `packages/remotion/`, so
  the whole workspace must be present — do not scope this service to `services/api`)
- **Build Command**: `pnpm install --frozen-lockfile && pip install -r services/api/requirements.txt`
- **Start Command**: `cd services/api && uvicorn main:app --host 0.0.0.0 --port $PORT`

## Environment Variables

Set these on the API service:

| Variable | Value |
|----------|-------|
| `B2_APPLICATION_KEY_ID` | Your B2 application key ID |
| `B2_APPLICATION_KEY` | Your B2 application key |
| `B2_BUCKET_NAME` | Your bucket name |
| `B2_REGION` | Your bucket's region, e.g. the middle segment of `s3.<region>.backblazeb2.com`. The S3 endpoint is derived from it |
| `API_CORS_ORIGINS` | Your web service URL (e.g. `https://web-production-xxx.up.railway.app`) |

Optional on the API service (all have working defaults — see `.env.example`):
`B2_ENDPOINT` (override only), `B2_PUBLIC_URL_BASE`, `RENDER_PRESET`,
`RENDER_CONCURRENCY`, `RENDER_VARIANTS`, `FRAME_UPLOAD_CONCURRENCY`,
`REMOTION_GL`, `FFMPEG_BINARY`, `NODE_BINARY`, `CAPTURE_URL_DEFAULT`,
`PROMO_PRODUCT_DEFAULT`.

Set this on the Web service:

| Variable | Value |
|----------|-------|
| `NEXT_PUBLIC_API_URL` | Your API service URL (e.g. `https://api-production-xxx.up.railway.app`) |

## Scaling caveat

Render passes run in an **in-process single worker**, so scaling the API past one
replica gives each replica its own queue and its own progress registry. See
`docs/RELIABILITY.md` before adding replicas.
