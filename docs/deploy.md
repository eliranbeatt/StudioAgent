# Deploy

## Convex (Backend)

1) Ensure a Convex deployment exists.
2) Set the required secrets in GitHub:
   - `CONVEX_DEPLOYMENT`
   - `CONVEX_DEPLOY_KEY`
3) Push to `main` to trigger `.github/workflows/convex-deploy.yml`.

## Vercel (Frontend)

1) Import this repo in Vercel.
2) Set `NEXT_PUBLIC_CONVEX_URL`:
   - Production URL: `https://energized-bandicoot-640.convex.cloud`
3) Deploys run automatically on pushes to `main`.

## Local verification

```
npm run lint
npm run build
```
