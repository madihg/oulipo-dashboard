"use client";

import { usePathname } from "next/navigation";
import Link from "next/link";
import "./navigation.css";

interface NavItem {
  label: string;
  href: string;
}

const items: NavItem[] = [
  { label: "IG Canvas", href: "/gallery/ig-canvas" },
  { label: "Background Studio", href: "/gallery/background-studio" },
];

export default function Navigation() {
  const pathname = usePathname();
  const isActive = (href: string) => pathname === href;

  return (
    <>
      {/* Desktop: Side panel on LEFT */}
      <nav className="nav-side-panel" aria-label="Main navigation">
        <div className="nav-section">
          <ul className="nav-items" role="list">
            {items.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`nav-item ${isActive(item.href) ? "nav-item--active" : ""}`}
                  aria-current={isActive(item.href) ? "page" : undefined}
                >
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="nav-logout">
          <button
            className="nav-logout-button"
            onClick={async () => {
              await fetch("/api/auth/logout", { method: "POST" });
              window.location.href = "/login";
            }}
          >
            Logout
          </button>
        </div>
      </nav>

      {/* Mobile: Bottom tab bar */}
      <nav className="nav-bottom-bar" aria-label="Mobile navigation">
        <div className="nav-tabs-row">
          {items.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`nav-tab ${isActive(item.href) ? "nav-tab--active" : ""}`}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>
    </>
  );
}
