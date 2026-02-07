import Link from 'next/link'

export default function NotFound() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      textAlign: 'center',
      padding: '2rem',
    }}>
      <h1 style={{
        fontFamily: 'Terminal Grotesque, sans-serif',
        fontSize: '4rem',
        fontWeight: 'normal',
        marginBottom: '1rem',
        color: 'rgba(0, 0, 0, 0.85)',
      }}>
        404
      </h1>
      <p style={{
        fontFamily: 'Diatype, sans-serif',
        fontSize: '1rem',
        color: 'rgba(0, 0, 0, 0.60)',
        marginBottom: '2rem',
      }}>
        This page could not be found.
      </p>
      <Link href="/gallery/content-publisher" style={{
        fontFamily: 'Diatype, sans-serif',
        fontSize: '0.875rem',
        color: 'rgba(0, 0, 0, 0.85)',
        border: '1px solid rgba(0, 0, 0, 0.40)',
        padding: '0.5rem 1.5rem',
        textDecoration: 'none',
        borderRadius: '0',
        transition: 'opacity 0.3s ease',
      }}>
        Back to dashboard
      </Link>
    </div>
  )
}
