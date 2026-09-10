'use client';

/** Last-resort error boundary (renders its own <html>/<body>). */
export default function GlobalError({ retry }: { error: Error; retry: () => void }) {
  return (
    <html lang="en">
      <body>
        <main style={{ fontFamily: 'system-ui', padding: '4rem', maxWidth: 640 }}>
          <h1 style={{ fontSize: '1.5rem' }}>Something went wrong</h1>
          <p style={{ color: '#666' }}>Please try again in a moment.</p>
          <button type="button" onClick={retry}>
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
