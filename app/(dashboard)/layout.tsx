import Navigation from '@/components/navigation/Navigation'
import './dashboard.css'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="dashboard-layout">
      <main className="dashboard-content">
        {children}
      </main>
      <Navigation />
    </div>
  )
}
