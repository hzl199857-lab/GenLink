# GenLink Media Worker

This is the external media-processing service for the GenLink video clip feature.
It is designed to run on Cloud Run and expose the API already consumed by the
Next.js app:

- `POST /clip-jobs`
- `GET /clip-jobs/{jobId}`

The worker stores job state in Upstash Redis and writes processed MP4 files to
Aliyun OSS.

## Required Environment Variables

```txt
UPSTASH_REDIS_REST_URL=
UPSTASH_REDIS_REST_TOKEN=
MEDIA_WORKER_TOKEN=

ALIYUN_VIDEO_OSS_BUCKET=
ALIYUN_VIDEO_OSS_REGION=
ALIYUN_VIDEO_OSS_ACCESS_KEY_ID=
ALIYUN_VIDEO_OSS_ACCESS_KEY_SECRET=
ALIYUN_VIDEO_OSS_PUBLIC_BASE_URL=
```

If you already use the generic OSS variables, the worker also accepts:

```txt
ALIYUN_OSS_BUCKET=
ALIYUN_OSS_REGION=
ALIYUN_OSS_ACCESS_KEY_ID=
ALIYUN_OSS_ACCESS_KEY_SECRET=
ALIYUN_OSS_PUBLIC_BASE_URL=
```

## Local Run

```bash
cd media-worker
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8080
```

Then set this in the GenLink Next.js app:

```txt
MEDIA_WORKER_BASE_URL=http://127.0.0.1:8080
MEDIA_WORKER_TOKEN=the-same-token
```

## Cloud Run Deploy

From the repository root:

```bash
gcloud run deploy genlink-media-worker \
  --source media-worker \
  --region asia-east1 \
  --allow-unauthenticated \
  --memory 2Gi \
  --cpu 2 \
  --timeout 3600 \
  --concurrency 1 \
  --no-cpu-throttling \
  --set-env-vars MEDIA_WORKER_TOKEN=replace-me
```

Add the rest of the secrets in the Cloud Run console or with
`--set-secrets` / `--update-env-vars`.

After deployment, copy the Cloud Run service URL into Vercel:

```txt
MEDIA_WORKER_BASE_URL=https://your-cloud-run-url
MEDIA_WORKER_TOKEN=the-same-token
```

## Important Cloud Run Note

This worker starts processing in a FastAPI background task after `POST /clip-jobs`
returns. To keep that background task alive, deploy the service with
`--no-cpu-throttling` so CPU stays allocated when the request finishes.
