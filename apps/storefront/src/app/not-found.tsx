/**
 * Global not-found. Rendered outside the [locale] tree, so it can't use
 * `useTranslations` — keep copy minimal here; localized 404s live inside
 * `[locale]/` segments.
 */
export default function NotFound() {
  return (
    <html lang="en">
      <body>
        <main style={{ fontFamily: 'system-ui', padding: '4rem', maxWidth: 640 }}>
          <h1 style={{ fontSize: '1.5rem' }}>Page not found</h1>
          <p style={{ color: '#666' }}>That page doesn&apos;t exist.</p>
          <a href="/">Go home</a>
        </main>
      </body>
    </html>
  );
}
