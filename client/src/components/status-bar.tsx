import { Link } from "react-router-dom";
import { IconActivity, IconBrandDocker, IconTerminal2 } from "@tabler/icons-react";
import { useWorkspaces } from "@/lib/workspace-store";
import { cn } from "@/lib/utils";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

export function StatusBar() {
  const [containerCount, setContainerCount] = useState<{
    running: number;
    total: number;
    errored: number;
  }>({
    running: 0,
    total: 0,
    errored: 0,
  });
  const [dockerRunning, setDockerRunning] = useState<boolean | null>(null);

  useEffect(() => {
    let mounted = true;
    const check = async () => {
      if (document.hidden) return;
      try {
        const [statusRes, containersRes] = await Promise.allSettled([
          api.dockerStatus(),
          api.listContainers(),
        ]);
        if (!mounted) return;
        if (statusRes.status === "fulfilled") {
          setDockerRunning(statusRes.value.running);
        } else {
          setDockerRunning(false);
        }
        if (containersRes.status === "fulfilled") {
          const containers = containersRes.value;
          setContainerCount({
            total: containers.length,
            running: containers.filter((c) => c.status === "running").length,
            errored: containers.filter((c) => c.status === "error").length,
          });
        }
      } catch {}
    };
    check();
    const handleVis = () => {
      if (!document.hidden) check();
    };
    document.addEventListener("visibilitychange", handleVis);
    const t = setInterval(check, 20000);
    return () => {
      mounted = false;
      clearInterval(t);
      document.removeEventListener("visibilitychange", handleVis);
    };
  }, []);

  return (
    <div className="sticky bottom-0 z-20 flex h-7 items-center gap-3 border-t bg-muted/40 px-3 font-mono text-[11px] text-muted-foreground backdrop-blur">
      <div className="flex items-center gap-1.5">
        <IconTerminal2 className="h-3 w-3" stroke={2} />
        <span className="text-foreground/80">Docker Manager</span>
        <span className="opacity-40">global host</span>
      </div>
      <span className="opacity-30">|</span>
      <div className="flex items-center gap-1.5">
        <IconBrandDocker className="h-3 w-3" stroke={2} />
        <span
          className={cn(
            "inline-block h-2 w-2 rounded-full",
            dockerRunning === true
              ? "bg-emerald-500"
              : dockerRunning === false
                ? "bg-red-500"
                : "bg-muted-foreground/50",
          )}
        />
        <span>
          {dockerRunning === null
            ? "checking..."
            : dockerRunning
              ? "Docker running"
              : "Docker not running"}
        </span>
      </div>
      <span className="opacity-30">|</span>
      <Link to="/containers" className="flex items-center gap-1.5 hover:text-foreground">
        <IconActivity className="h-3 w-3" stroke={2} />
        <span>
          {containerCount.running}/{containerCount.total} running
        </span>
        {containerCount.errored > 0 && (
          <span className="text-destructive">· {containerCount.errored} error</span>
        )}
      </Link>
      <div className="ml-auto flex items-center gap-3">
        <span className="hidden sm:inline">press shift + ? for shortcuts</span>
      </div>
    </div>
  );
}
