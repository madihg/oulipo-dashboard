'use client'

import { useState } from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import './navigation.css'

interface NavItem {
  label: string
  href: string
  placeholder?: boolean
}

interface NavSection {
  label: string
  items: NavItem[]
}

const sections: NavSection[] = [
  {
    label: 'Studio',
    items: [
      { label: 'Context Scan', href: '/studio/context-scan', placeholder: true },
    ],
  },
  {
    label: 'Gallery',
    items: [
      { label: 'Content Publisher', href: '/gallery/content-publisher' },
      { label: 'Update Events', href: '/gallery/update-events' },
      { label: 'Deadline Calendar', href: '/gallery/deadline-calendar' },
    ],
  },
  {
    label: 'Market',
    items: [
      { label: 'CRM', href: '/market/crm', placeholder: true },
      { label: 'Outreach Agent', href: '/market/outreach-agent', placeholder: true },
    ],
  },
]

export default function Navigation() {
  const pathname = usePathname()
  const [expandedSections, setExpandedSections] = useState<string[]>(['Gallery'])

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label)
        ? prev.filter((s) => s !== label)
        : [...prev, label]
    )
  }

  const isActive = (href: string) => pathname === href

  return (
    <>
      {/* Desktop: Side panel */}
      <nav className="nav-side-panel" aria-label="Main navigation">
        {sections.map((section) => (
          <div key={section.label} className="nav-section">
            <button
              className="nav-section-toggle"
              onClick={() => toggleSection(section.label)}
              aria-expanded={expandedSections.includes(section.label)}
            >
              {section.label}
            </button>
            {expandedSections.includes(section.label) && (
              <ul className="nav-items">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`nav-item ${isActive(item.href) ? 'nav-item--active' : ''}`}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                    >
                      {item.label}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
        <div className="nav-logout">
          <button
            className="nav-logout-button"
            onClick={async () => {
              await fetch('/api/auth/logout', { method: 'POST' })
              window.location.href = '/login'
            }}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Mobile: Bottom tab bar */}
      <nav className="nav-bottom-bar" aria-label="Main navigation">
        {sections.map((section) => (
          <Link
            key={section.label}
            href={section.items[0].href}
            className={`nav-tab ${
              section.items.some((item) => pathname.startsWith(item.href.split('/').slice(0, 2).join('/')))
                ? 'nav-tab--active'
                : ''
            }`}
          >
            {section.label}
          </Link>
        ))}
      </nav>
    </>
  )
}
