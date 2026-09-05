/** Shared presentational components. */

export function Card(props: { title?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`card ${props.className ?? ""}`}>
      {props.title && <h3 className="card-title">{props.title}</h3>}
      {props.children}
    </section>
  );
}

export function Spinner(props: { label: string }) {
  return (
    <div className="spinner-row" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{props.label}</span>
    </div>
  );
}

export function ErrorBanner(props: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <strong>Something went wrong.</strong> {props.message}
    </div>
  );
}

export function EmptyNote(props: { text: string }) {
  return <p className="empty-note">{props.text}</p>;
}
