'use client'

import { useState, useCallback } from 'react'
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
      { label: 'Upcoming', href: '/studio/upcoming' },
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
      { label: 'Inbox Agent', href: '/market/inbox-agent', placeholder: true },
      { label: 'CRM', href: '/market/crm', placeholder: true },
      { label: 'Outreach Agent', href: '/market/outreach-agent', placeholder: true },
    ],
  },
]

export default function Navigation() {
  const pathname = usePathname()

  // Auto-expand the section matching the current path
  const getInitialExpanded = () => {
    const expanded: string[] = ['Gallery'] // Always start with Gallery expanded
    for (const section of sections) {
      if (section.items.some((item) => pathname.startsWith(item.href.split('/').slice(0, 2).join('/')))) {
        if (!expanded.includes(section.label)) {
          expanded.push(section.label)
        }
      }
    }
    return expanded
  }

  const [expandedSections, setExpandedSections] = useState<string[]>(getInitialExpanded)

  const toggleSection = (label: string) => {
    setExpandedSections((prev) =>
      prev.includes(label)
        ? prev.filter((s) => s !== label)
        : [...prev, label]
    )
  }

  const isActive = (href: string) => pathname === href

  // Find the active section for mobile sub-nav
  const activeSection = sections.find((section) =>
    section.items.some((item) => pathname.startsWith(item.href.split('/').slice(0, 2).join('/')))
  ) || sections[1] // Default to Gallery

  // Move focus to the main content area after navigation
  const handleNavClick = useCallback(() => {
    requestAnimationFrame(() => {
      const mainContent = document.getElementById('main-content')
      if (mainContent) {
        mainContent.focus()
      }
    })
  }, [])

  return (
    <>
      {/* Desktop: Side panel on LEFT */}
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
              <ul className="nav-items" role="list">
                {section.items.map((item) => (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={`nav-item ${isActive(item.href) ? 'nav-item--active' : ''}`}
                      aria-current={isActive(item.href) ? 'page' : undefined}
                      onClick={handleNavClick}
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

      {/* Mobile: Bottom tab bar — section tabs on top, sub-items below (UX/UI Pro: hierarchy) */}
      <nav className="nav-bottom-bar" aria-label="Mobile navigation">
        {/* Row 1: Section tabs (Studio | Gallery | Market) — larger, primary hierarchy */}
        <div className="nav-tabs-row">
          {sections.map((section) => (
            <Link
              key={section.label}
              href={section.items[0].href}
              className={`nav-tab ${
                section.items.some((item) => pathname.startsWith(item.href.split('/').slice(0, 2).join('/')))
                  ? 'nav-tab--active'
                  : ''
              }`}
              onClick={handleNavClick}
            >
              {section.label}
            </Link>
          ))}
        </div>
        {/* Row 2: Sub-items for active section — horizontal scroll */}
        {activeSection && activeSection.items.length > 1 && (
          <div className="nav-mobile-sub">
            {activeSection.items.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`nav-mobile-sub-item ${isActive(item.href) ? 'nav-mobile-sub-item--active' : ''}`}
                onClick={handleNavClick}
              >
                {item.label}
              </Link>
            ))}
          </div>
        )}
      </nav>
    </>
  )
}
