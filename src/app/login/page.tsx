"use client"

import { FormEvent, useMemo, useState } from 'react'
import { useAuthActions } from '@convex-dev/auth/react'
import { useConvexAuth } from 'convex/react'

function getErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  return 'Login failed. Please try again.'
}

export default function LoginPage() {
  const { signIn } = useAuthActions()
  const { isLoading } = useConvexAuth()
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const loginEmail = useMemo(
    () => process.env.NEXT_PUBLIC_APP_LOGIN_EMAIL ?? '',
    []
  )

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setError(null)
    setIsSubmitting(true)

    try {
      await signIn('password', {
        flow: 'signIn',
        email: loginEmail,
        password,
      })
    } catch (err) {
      try {
        await signIn('password', {
          flow: 'signUp',
          email: loginEmail,
          password,
        })
      } catch (signUpErr) {
        setError(getErrorMessage(signUpErr))
      }
    } finally {
      setIsSubmitting(false)
    }
  }

  const isDisabled = isSubmitting || isLoading || !loginEmail

  return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-6">
      <div className="w-full max-w-md rounded-2xl border border-gray-200 bg-white p-8 shadow-sm">
        <div className="text-xs uppercase tracking-[0.3em] text-gray-400">
          Studio Agent
        </div>
        <h1 className="mt-2 text-2xl font-semibold text-gray-900">
          Sign in to continue
        </h1>
        <p className="mt-2 text-sm text-gray-500">
          Access is shared for the studio. Enter the password to open the app.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-4">
          <div className="space-y-1">
            <label className="text-xs font-semibold uppercase tracking-wider text-gray-500">
              Account
            </label>
            <div className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-sm text-gray-700">
              {loginEmail || 'Missing NEXT_PUBLIC_APP_LOGIN_EMAIL'}
            </div>
          </div>

          <div className="space-y-1">
            <label
              htmlFor="password"
              className="text-xs font-semibold uppercase tracking-wider text-gray-500"
            >
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-gray-200"
              disabled={isDisabled}
            />
          </div>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-600">
              {error}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={isDisabled || !password}
            className="w-full rounded-lg bg-black px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
          >
            {isSubmitting ? 'Signing in...' : 'Sign in'}
          </button>
        </form>
      </div>
    </div>
  )
}
