import Navigation from '@/components/navigation/Navigation'
import './dashboard.css'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="dashboard-layout">
      <a href="#main-content" className="skip-to-content">
        Skip to content
      </a>
      <Navigation />
      <main
        id="main-content"
        className="dashboard-content"
        tabIndex={-1}
      >
        {children}
      </main>
    </div>
  )
}
