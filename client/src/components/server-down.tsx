import { ServerOff, RefreshCw, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function ServerDownPage({
  onRetry,
  checking,
}: {
  onRetry: () => void;
  checking: boolean;
}) {
  return (
    <div className="grid min-h-screen w-full place-items-center bg-background p-4">
      <div className="flex w-full max-w-md flex-col items-center gap-4 text-center">
        <div className="relative grid h-20 w-20 place-items-center rounded-2xl border border-red-500/30 bg-red-500/5">
          <ServerOff className="h-10 w-10 text-red-500" strokeWidth={1.5} />
          <span className="absolute -right-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-red-500/10">
            <WifiOff className="h-3.5 w-3.5 text-red-500" strokeWidth={1.75} />
          </span>
        </div>

        <div className="space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Server is down</h1>
          <p className="text-sm text-muted-foreground">
            The backend is offline or under maintenance right now. The app will keep retrying
            automatically — no changes needed on your end.
          </p>
        </div>

        <div className="flex items-center gap-2 rounded-full border border-red-500/30 bg-red-500/5 px-3 py-1.5">
          <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" />
          <span className="font-mono text-xs text-red-600 dark:text-red-400">
            Backend unreachable
          </span>
        </div>

        <Button
          size="lg"
          className="mt-2 w-full max-w-60 gap-2"
          onClick={onRetry}
          disabled={checking}
        >
          <RefreshCw className={cn("h-4 w-4", checking && "animate-spin")} />
          {checking ? "Connecting…" : "Try again"}
        </Button>

        <p className="font-mono text-[11px] text-muted-foreground/70">
          Retrying automatically every 5 seconds
        </p>
      </div>
    </div>
  );
}