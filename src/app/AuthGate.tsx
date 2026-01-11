"use client"

import { ReactNode, useEffect } from 'react'
import { useConvexAuth } from 'convex/react'
import { usePathname, useRouter } from 'next/navigation'

export default function AuthGate({ children }: { children: ReactNode }) {
  const { isAuthenticated, isLoading } = useConvexAuth()
  const router = useRouter()
  const pathname = usePathname()
  const isLoginRoute = pathname === '/login'

  useEffect(() => {
    if (isLoading) return
    if (!isAuthenticated && !isLoginRoute) {
      router.replace('/login')
      return
    }
    if (isAuthenticated && isLoginRoute) {
      router.replace('/')
    }
  }, [isAuthenticated, isLoading, isLoginRoute, router])

  if (isLoading) return null
  if (!isAuthenticated && !isLoginRoute) return null

  return <>{children}</>
}
