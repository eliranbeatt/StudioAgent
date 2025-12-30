# CI/CD

This project uses GitHub Actions for CI and Convex deploys. Vercel handles
frontend deploys via Git integration (recommended).

## Workflows

- `.github/workflows/ci.yml`
  - Runs on PRs and pushes to `main`.
  - Installs dependencies, runs `npm run lint` and `npm run build`.
- `.github/workflows/convex-deploy.yml`
  - Runs on pushes to `main`.
  - Deploys Convex with `npx convex deploy --prod`.

## Required GitHub Secrets

Set these in the repository settings:

- `CONVEX_DEPLOYMENT`: your deployment id (example: `energized-bandicoot-640`).
- `CONVEX_DEPLOY_KEY`: a Convex deploy key with production access.

## Vercel Integration

1) Connect the GitHub repo to Vercel.
2) Set Environment Variables in Vercel:
   - `NEXT_PUBLIC_CONVEX_URL`: the Convex URL for the environment.
3) Vercel will run `npm run build` automatically and deploy on merge to `main`.
