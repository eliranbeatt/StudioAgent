import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import ConvexClientProvider from './ConvexClientProvider'
import { StudioTopNav } from '../components/nav/StudioTopNav'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AgenticEshet',
  description: 'Project Management for Studios',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <ConvexClientProvider>
          <div className="flex flex-col h-screen overflow-hidden">
            <StudioTopNav />
            <main className="flex-1 overflow-auto">
              {children}
            </main>
          </div>
        </ConvexClientProvider>
      </body>
    </html>
  )
}
