/** Shared presentational components. */
import { AlertIcon, InboxIcon } from "./icons";
import type { ReactNode } from "react";

export function Card(props: { title?: string; subtitle?: string; icon?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${props.className ?? ""}`}>
      {props.title && (
        <h3 className="card-title">
          {props.icon}
          {props.title}
        </h3>
      )}
      {props.subtitle && <p className="card-subtitle">{props.subtitle}</p>}
      {props.children}
    </section>
  );
}

/** Standard page heading block used above each page's cards. */
export function PageHead(props: { title: string; desc?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h2 className="page-title">{props.title}</h2>
        {props.desc && <p className="page-desc">{props.desc}</p>}
      </div>
      {props.children}
    </div>
  );
}

/** Small KPI tile — every value passed in must come from a real API response. */
export function StatChip(props: { icon?: ReactNode; label: string; value: ReactNode }) {
  return (
    <div className="stat-chip">
      {props.icon && <span className="stat-icon">{props.icon}</span>}
      <span className="stat-body">
        <span className="stat-value">{props.value}</span>
        <span className="stat-label">{props.label}</span>
      </span>
    </div>
  );
}

/** Compact pill badge for table cells and counters. */
export function Badge(props: { children: ReactNode; neutral?: boolean }) {
  return <span className={`badge ${props.neutral ? "neutral" : ""}`}>{props.children}</span>;
}

export function Spinner(props: { label: string }) {
  return (
    <div className="spinner-row" role="status">
      <span className="spinner" aria-hidden="true" />
      <span>{props.label}</span>
    </div>
  );
}

export function Skeleton(props: { rows?: number }) {
  const count = props.rows ?? 3;
  return (
    <div className="skeleton-box" style={{ display: "flex", flexDirection: "column", gap: 8, padding: "8px 0" }}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={{ height: 18, background: "rgba(148,163,184,0.18)", borderRadius: 4, width: i === 0 ? "80%" : i === count - 1 ? "60%" : "100%" }} />
      ))}
    </div>
  );
}

export function ErrorBanner(props: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <AlertIcon />
        <div>
          <strong>Something went wrong.</strong>
          {props.message}
        </div>
      </div>
      {props.onRetry && (
        <button type="button" className="health-retry" onClick={props.onRetry} style={{ flexShrink: 0 }}>
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyNote(props: { text?: string; title?: string; hint?: string }) {
  return (
    <div className="empty-state">
      <InboxIcon />
      <span className="empty-title">{props.title ?? "Nothing to show yet"}</span>
      {(props.hint ?? props.text) && <span className="empty-hint">{props.hint ?? props.text}</span>}
    </div>
  );
}
