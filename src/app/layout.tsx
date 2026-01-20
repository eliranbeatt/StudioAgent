import type { Metadata } from 'next'
import './globals.css'
import ConvexClientProvider from './ConvexClientProvider'
import { StudioTopNav } from '../components/nav/StudioTopNav'

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
      <body>
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
