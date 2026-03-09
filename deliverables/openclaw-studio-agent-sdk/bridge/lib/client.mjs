import { ConvexHttpClient } from 'convex/browser'
import { makeFunctionReference } from 'convex/server'

function resolveConvexUrl() {
  const value = String(
    process.env.STUDIO_AGENT_CONVEX_URL ??
    process.env.NEXT_PUBLIC_CONVEX_URL ??
    process.env.CONVEX_URL ??
    ''
  ).trim()
  if (!value) {
    throw new Error('Missing STUDIO_AGENT_CONVEX_URL')
  }
  return value
}

export function fn(path) {
  return makeFunctionReference(path)
}

export function createConvexClient() {
  const client = new ConvexHttpClient(resolveConvexUrl())
  const authToken = String(process.env.STUDIO_AGENT_CONVEX_AUTH_TOKEN ?? '').trim()
  const adminKey = String(process.env.STUDIO_AGENT_CONVEX_ADMIN_KEY ?? '').trim()
  if (adminKey) {
    client.setAdminAuth(adminKey)
  } else if (authToken) {
    client.setAuth(authToken)
  }
  return client
}

export async function convexQuery(path, args = {}) {
  const client = createConvexClient()
  return client.query(fn(path), args)
}

export async function convexMutation(path, args = {}) {
  const client = createConvexClient()
  return client.mutation(fn(path), args)
}

export async function convexAction(path, args = {}) {
  const client = createConvexClient()
  return client.action(fn(path), args)
}

export function requireTavilyKey() {
  const value = String(process.env.TAVILY_API_KEY ?? '').trim()
  if (!value) {
    throw new Error('Missing TAVILY_API_KEY')
  }
  return value
}
