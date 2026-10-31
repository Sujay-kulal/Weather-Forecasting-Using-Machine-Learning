/** Shared presentational components for WeatherCast India enterprise platform. */
import { AlertIcon, InboxIcon } from "./icons";
import type { ReactNode } from "react";

export interface CardProps {
  title?: string;
  subtitle?: string;
  icon?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}

export function Card({ title, subtitle, icon, action, children, className }: CardProps) {
  return (
    <section className={`panel ${className ?? ""}`}>
      {(title || action) && (
        <div className="panel-header">
          <div>
            <h3 className="panel-title">
              {icon}
              {title}
            </h3>
            {subtitle && <p className="panel-subtitle">{subtitle}</p>}
          </div>
          {action && <div className="panel-action">{action}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

export interface PageHeadProps {
  title: string;
  desc?: string;
  badge?: ReactNode;
  children?: ReactNode;
}

/** Standard page heading block used above each page's views. */
export function PageHead({ title, desc, badge, children }: PageHeadProps) {
  return (
    <div className="page-head">
      <div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <h2 className="page-title">{title}</h2>
          {badge}
        </div>
        {desc && <p className="page-desc">{desc}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}

export interface StatChipProps {
  icon?: ReactNode;
  label: string;
  value: ReactNode;
  sub?: string;
}

/** Professional KPI tile — every value passed in must come from a real API response. */
export function StatChip({ icon, label, value, sub }: StatChipProps) {
  return (
    <div className="stat-chip">
      {icon && <span className="stat-icon">{icon}</span>}
      <span className="stat-body">
        <span className="stat-value">{value}</span>
        <span className="stat-label">{label}</span>
        {sub && <span style={{ fontSize: "11px", color: "var(--text-faint)", marginTop: 2 }}>{sub}</span>}
      </span>
    </div>
  );
}

export interface BadgeProps {
  children: ReactNode;
  variant?: "default" | "neutral" | "success" | "warning" | "danger" | "info";
  neutral?: boolean;
}

/** Compact pill badge for table cells and status tags. */
export function Badge({ children, variant, neutral }: BadgeProps) {
  const finalVariant = variant ?? (neutral ? "neutral" : "default");
  return <span className={`badge ${finalVariant}`}>{children}</span>;
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
    <div className="skeleton-box" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="skeleton-line"
          style={{ width: i === 0 ? "85%" : i === count - 1 ? "60%" : "100%" }}
        />
      ))}
    </div>
  );
}

export function ErrorBanner(props: { message: string; onRetry?: () => void }) {
  return (
    <div className="error-banner" role="alert">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <AlertIcon style={{ width: 18, height: 18, flexShrink: 0, color: "var(--danger)" }} />
        <div>
          <strong>System Alert</strong>
          <span>{props.message}</span>
        </div>
      </div>
      {props.onRetry && (
        <button
          type="button"
          className="btn-outline"
          onClick={props.onRetry}
          style={{ flexShrink: 0, borderColor: "var(--danger-border)", color: "var(--danger)" }}
        >
          Retry
        </button>
      )}
    </div>
  );
}

export function EmptyNote(props: { text?: string; title?: string; hint?: string; action?: ReactNode }) {
  return (
    <div className="empty-state">
      <InboxIcon />
      <span className="empty-title">{props.title ?? "No Records Available"}</span>
      {(props.hint ?? props.text) && <span className="empty-hint">{props.hint ?? props.text}</span>}
      {props.action && <div style={{ marginTop: 12 }}>{props.action}</div>}
    </div>
  );
}
