import { CircleAlert, CircleCheck, OctagonX } from "lucide-react";
import type {
  ButtonHTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_STYLES: Record<ButtonVariant, string> = {
  primary: "bg-pine text-white hover:bg-pine-hover disabled:bg-line-strong disabled:text-ink-3",
  secondary:
    "bg-card text-pine border border-line hover:border-line-strong hover:bg-canvas disabled:text-ink-3",
  danger: "bg-card text-block border border-block-line hover:bg-block-bg disabled:text-ink-3",
  ghost: "text-ink-2 hover:bg-subtle hover:text-ink",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      className={`inline-flex h-10 items-center justify-center gap-2 rounded-control px-4 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${BUTTON_STYLES[variant]} ${className}`}
      {...props}
    />
  );
}

export function Card({ className = "", children }: { className?: string; children: ReactNode }) {
  return (
    <section className={`rounded-panel border border-line bg-card shadow-card ${className}`}>
      {children}
    </section>
  );
}

/** Registration numbers and rule codes, in monospace. */
export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`font-mono text-xs tracking-wide ${className}`}>{children}</span>;
}

export function Chip({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-md bg-subtle px-2 py-0.5 text-xs font-medium text-ink-2">
      {children}
    </span>
  );
}

export type Status = "pass" | "warn" | "block" | "pending";

const STATUS: Record<Status, { label: string; className: string; icon: ReactNode }> = {
  pass: {
    label: "Sem alertas",
    className: "bg-pass-bg text-pass border-pass-line",
    icon: <CircleCheck aria-hidden className="size-3.5" />,
  },
  warn: {
    label: "Revisar",
    className: "bg-review-bg text-review border-review-line",
    icon: <CircleAlert aria-hidden className="size-3.5 text-review-icon" />,
  },
  block: {
    label: "Bloqueado",
    className: "bg-block-bg text-block border-block-line",
    icon: <OctagonX aria-hidden className="size-3.5 text-block-icon" />,
  },
  pending: {
    label: "Verificando",
    className: "bg-subtle text-ink-2 border-line",
    icon: <CircleAlert aria-hidden className="size-3.5" />,
  },
};

/** Compliance status: always icon + word, never color alone. */
export function StatusBadge({ status, label }: { status: Status; label?: string }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs font-semibold ${s.className}`}
    >
      {s.icon}
      {label ?? s.label}
    </span>
  );
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
}) {
  return (
    // biome-ignore lint/a11y/noLabelWithoutControl: the control is passed as a child
    <label className="flex flex-col gap-1.5">
      <span className="text-xs font-semibold text-ink-2">{label}</span>
      {children}
      {hint && !error && <span className="text-xs text-ink-3">{hint}</span>}
      {error && <span className="text-xs font-medium text-block">{error}</span>}
    </label>
  );
}

const CONTROL =
  "h-10 rounded-control border border-line bg-card px-3 text-sm text-ink placeholder:text-ink-3 hover:border-line-strong focus:border-focus focus:outline-none focus:ring-2 focus:ring-focus/25";

export function Input(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${CONTROL} ${props.className ?? ""}`} />;
}

export function Logo() {
  return (
    <span className="flex items-center gap-2">
      <span
        aria-hidden
        className="grid size-8 place-items-center rounded-control bg-pine text-sm font-bold text-white"
      >
        D
      </span>
      <span className="text-lg font-bold tracking-tight text-ink">Destra</span>
    </span>
  );
}
