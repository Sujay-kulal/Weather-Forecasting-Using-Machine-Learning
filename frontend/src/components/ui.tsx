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

export function ErrorBanner(props: { message: string }) {
  return (
    <div className="error-banner" role="alert">
      <AlertIcon />
      <div>
        <strong>Something went wrong.</strong>
        {props.message}
      </div>
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
