interface FullPageLoadingProps {
  label?: string
}

export function FullPageLoading({ label = '载入中…' }: FullPageLoadingProps) {
  return (
    <main className="centered-page" aria-busy="true" aria-live="polite">
      <div className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </main>
  )
}
