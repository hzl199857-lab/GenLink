# GenLink Aliyun Deployment

This folder contains deployment templates for running GenLink behind Nginx on
the existing Aliyun Lightweight Application Server.

## Target Layout

```txt
zerinnai.online          -> existing blog
genlink.zerinnai.online  -> GenLink on 127.0.0.1:3002
```

Keep the blog on its current path. GenLink should run on a different local port,
for example `3002`, and Nginx routes by `server_name`.

## Server Commands

Run these on the Aliyun server after DNS points `genlink.zerinnai.online` to the
server public IP.

```bash
sudo mkdir -p /www
cd /www
sudo git clone <your-repo-url> GenLink
sudo chown -R "$USER":"$USER" /www/GenLink
cd /www/GenLink

npm ci
cp deploy/.env.production.example .env.production
nano .env.production

npx prisma migrate deploy
npm run build
sudo npm install -g pm2
pm2 start deploy/ecosystem.config.cjs
pm2 save
pm2 startup
```

Copy the Nginx file and reload Nginx:

```bash
sudo cp deploy/nginx-genlink.conf /etc/nginx/conf.d/genlink.conf
sudo nginx -t
sudo systemctl reload nginx
```

Issue HTTPS certificate after the HTTP route works:

```bash
sudo certbot --nginx -d genlink.zerinnai.online
```

## Important Environment Values

- `BETTER_AUTH_URL` must be `https://genlink.zerinnai.online`.
- `GENLINK_PUBLIC_BASE_URL` must be `https://genlink.zerinnai.online`.
- `NEXT_PUBLIC_REFERENCE_IMAGE_UPLOAD_MODE` should be `oss` in production.
- `ALIYUN_OSS_PUBLIC_BASE_URL` is the browser-accessible public URL.
- `ALIYUN_OSS_INTERNAL_ENDPOINT` is only for server-side uploads from Aliyun.
- `OPENCLAW_CONFIG_PATH` should point to the deployed OpenClaw config when `OPENCLAW_REAL_RUNTIME=1` is enabled for PlanF/OpenClaw workflows.
- `OPENCLAW_STATE_DIR` must be writable by the PM2 process when `OPENCLAW_REAL_RUNTIME=1`.

For an OSS bucket in Hangzhou, the internal endpoint usually looks like:

```txt
https://your-bucket.oss-cn-hangzhou-internal.aliyuncs.com
```

Do not use an internal endpoint as a public base URL. Browsers on the public
internet cannot access Aliyun internal endpoints.

## SQLite Note

The current Prisma datasource is SQLite and is fixed in `prisma/schema.prisma`
as `file:./dev.db`, so the database file lives at:

```txt
/www/GenLink/prisma/dev.db
```

For a fresh production database, run `npx prisma migrate deploy` before starting
the app. If you need existing local data, copy your local `prisma/dev.db` to the
same server path before starting GenLink. For multi-user production traffic,
consider migrating the datasource to MySQL or PostgreSQL later.
