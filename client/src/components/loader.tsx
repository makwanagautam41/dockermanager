import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

export function Loader({
  size = 16,
  className,
  label,
}: {
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <div
      className={cn("inline-flex items-center gap-2 text-muted-foreground", className)}
      role="status"
      aria-live="polite"
    >
      <Spinner className={cn("shrink-0", className)} style={{ width: size, height: size } as any} />
      {label && <span className="font-mono text-xs">{label}</span>}
    </div>
  );
}

export function FullPageLoader({ label = "loading workspace…" }: { label?: string }) {
  return (
    <div className="grid min-h-[60vh] w-full place-items-center">
      <div className="flex flex-col items-center gap-3">
        <div className="relative flex h-10 w-10 items-center justify-center">
          <Spinner className="h-6 w-6 text-foreground/80" />
        </div>
        <div className="font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          {label}
        </div>
      </div>
    </div>
  );
}

export default Loader;
