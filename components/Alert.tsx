export function Alert({ kind = "info", children }: { kind?: "info" | "error" | "success" | "warn"; children: React.ReactNode }) {
  const styles = {
    info: "bg-brand-soft text-brand-deep border-brand/20",
    error: "bg-danger-soft text-danger border-danger/20",
    success: "bg-brand-soft text-brand-deep border-brand/20",
    warn: "bg-gold-soft text-gold-deep border-gold/40",
  }[kind];
  return <div className={`rounded-lg border px-4 py-3 text-sm ${styles}`}>{children}</div>;
}
