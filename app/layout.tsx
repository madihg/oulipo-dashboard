import type { Metadata } from 'next'
import '@/styles/globals.css'
import '@/styles/fonts.css'

export const metadata: Metadata = {
  title: 'Oulipo Dashboard',
  description: 'Creative practice dashboard for publishing, events, and deadlines',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  )
}
