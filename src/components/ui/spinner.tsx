import { LoaderCircle } from "lucide-react";

export function Spinner({ label, size = 16 }: { label?: string; size?: number }) {
  return (
    <span className="spinner" role={label ? "status" : undefined}>
      <LoaderCircle aria-hidden="true" size={size} />
      {label ? <span className="sr-only">{label}</span> : null}
    </span>
  );
}
