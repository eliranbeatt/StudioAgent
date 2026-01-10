# Repository Guidelines

## Project Structure & Module Organization
- `src/app/` holds the Next.js App Router pages, layouts, and providers.
- `src/lib/` is for shared client/server utilities and helpers.
- `convex/` contains Convex backend functions, schema, and mutations/queries.
- `docs/` and `Specs/` store product notes and specification drafts.
- Config lives at repo root (e.g., `next.config.js`, `tailwind.config.js`, `eslint.config.js`, `.env.local`).

## Build, Test, and Development Commands
- `npm run dev`: start the Next.js dev server.
- `npm run build`: create a production build.
- `npm run start`: run the production server from the build output.
- `npm run lint`: run ESLint with the Next.js config.

## Coding Style & Naming Conventions
- TypeScript/React with functional components in `*.ts`/`*.tsx`.
- Match existing style: 2-space indentation, single quotes, no semicolons.
- Use PascalCase for React components and camelCase for functions/vars.
- Tailwind is available via `@import "tailwindcss"` in `src/app/globals.css`.

## Testing Guidelines
- There is no automated test suite in this repo yet.
- Use `npm run lint` for baseline checks before submitting changes.
- If you add tests, keep them close to the code (e.g., `src/app/**/__tests__` or `src/lib/**/__tests__`) and name files `*.test.ts` or `*.test.tsx`.

## Commit & Pull Request Guidelines
- Commit history is informal and feature-focused (short, descriptive phrases).
- Use concise commit messages that state what changed (e.g., “add trello sync view”).
- PRs should include: a short summary, testing performed, and screenshots for UI changes. Link related issues when applicable.

## Security & Configuration Tips
- Keep secrets in `.env.local` and never commit it.
- Convex schema and backend logic live under `convex/`; review schema changes carefully.
