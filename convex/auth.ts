import { convexAuth } from '@convex-dev/auth/server'
import { Password } from '@convex-dev/auth/providers/Password'

const allowedEmail = process.env.APP_LOGIN_EMAIL?.toLowerCase().trim()
const allowedPassword = process.env.APP_LOGIN_PASSWORD ?? ''

export const { auth, signIn, signOut, store, isAuthenticated } = convexAuth({
  providers: [
    Password({
      profile: (params) => {
        const email = String(params.email ?? '').toLowerCase().trim()
        if (!allowedEmail || !allowedPassword) {
          throw new Error('Missing login configuration')
        }
        if (email !== allowedEmail) {
          throw new Error('Invalid credentials')
        }
        const now = Date.now()
        return {
          email,
          name: 'Studio User',
          displayName: 'Studio User',
          createdAt: now,
          updatedAt: now,
        }
      },
      validatePasswordRequirements: (password) => {
        if (!allowedPassword) {
          throw new Error('Missing login configuration')
        }
        if (password !== allowedPassword) {
          throw new Error('Invalid credentials')
        }
      },
    }),
  ],
})
