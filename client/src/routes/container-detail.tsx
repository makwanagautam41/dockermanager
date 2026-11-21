import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  IconLoader2,
  IconRefresh,
  IconPower,
  IconRotate,
  IconTrash,
  IconTerminal,
  IconCopy,
  IconNetwork,
  IconClock,
  IconX,
  IconActivity,
  IconSquare,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { LogsViewer } from "@/components/logs-viewer";
import { api } from "@/lib/api";
import { useHealth } from "@/lib/health";
import { cn } from "@/lib/utils";
import { PageHelpPopover } from "@/components/page-help-popover";

export default function ContainerDetailPage() {
  const { containerId } = useParams();
  const navigate = useNavigate();
  const docker = useHealth("dockerEngine");
  const [container, setContainer] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [fetchError, setFetchError] = useState("");
  const [logsOpen, setLogsOpen] = useState(false);

  const fetchContainer = async (silent = false) => {
    if (!containerId) return;
    if (silent) setRefreshing(true);
    else setLoading(true);
    setFetchError("");
    try {
      const data = await api.inspectContainer(containerId);
      setContainer(data);
    } catch (e: any) {
      const message = e?.message || "Failed to load container";
      if (!silent) {
        setFetchError(message);
        toast.error(`Failed to load container: ${message}`);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    setContainer(null);
    fetchContainer();
    const t = setInterval(() => {
      if (!document.hidden) fetchContainer(true);
    }, 15000);
    return () => clearInterval(t);
  }, [containerId]);

  const runAction = async (action: "start" | "stop" | "restart") => {
    if (!containerId) return;
    setBusy((b) => ({ ...b, [action]: true }));
    try {
      if (action === "start") await api.startContainer(containerId);
      else if (action === "stop") await api.stopContainer(containerId);
      else await api.restartContainer(containerId);
      toast.success(`Container ${action}ed`);
      await fetchContainer(true);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy((b) => ({ ...b, [action]: false }));
    }
  };

  const removeContainer = async () => {
    if (!containerId) return;
    if (!window.confirm("Are you sure you want to remove this container?")) return;
    setBusy((b) => ({ ...b, remove: true }));
    try {
      await api.removeContainer(containerId);
      toast.success("Container removed");
      navigate("/containers");
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy((b) => ({ ...b, remove: false }));
    }
  };

  const copyValue = async (value: string) => {
    await navigator.clipboard.writeText(value);
    toast.success("Copied to clipboard");
  };

  const name = container?.Name?.replace(/^\//, "") || container?.id?.slice(0, 12) || "unknown";
  const image = container?.Config?.Image || "unknown";
  const status = container?.State?.Status || "unknown";
  const state = container?.State || {};
  const networks = (container?.NetworkSettings?.Networks as Record<string, any>) || {};
  const ports = (container?.NetworkSettings?.Ports as Record<string, any>) || {};
  const mounts = (container?.Mounts as any[]) || [];
  const env = (container?.Config?.Env as string[]) || [];
  const created = container?.Created || "";
  const startedAt = state.StartedAt || "";
  const finishedAt = state.FinishedAt || "";
  const exitCode = state.ExitCode;
  const oomKilled = state.OOMKilled || false;
  const pid = state.Pid;
  const restartCount = state.RestartCount || 0;

  const portList = useMemo(() => {
    const list: { private: string; public: string; type: string }[] = [];
    Object.entries(ports).forEach(([privatePort, bindings]) => {
      const type = privatePort.includes("udp") ? "udp" : "tcp";
      const cleanPrivate = privatePort.replace(/\/tcp$/, "").replace(/\/udp$/, "");
      if (bindings && bindings.length > 0) {
        bindings.forEach((b: any) => {
          list.push({
            private: cleanPrivate,
            public: b.HostIp || "0.0.0.0",
            type,
          });
        });
      } else {
        list.push({ private: cleanPrivate, public: "—", type });
      }
    });
    return list;
  }, [ports]);

  const networkList = useMemo(() => {
    return Object.entries(networks).map(([netName, netInfo]) => {
      const info = netInfo as any;
      return {
        name: netName,
        ip: info?.IPAddress || "—",
        mac: info?.MacAddress || "—",
        gateway: info?.Gateway || "—",
      };
    });
  }, [networks]);

  const mountList = useMemo(() => {
    return mounts.map((m: any, i: number) => ({
      source: m.Source || "—",
      destination: m.Destination || "—",
      mode: m.Mode || "—",
      rw: m.RW !== false,
    }));
  }, [mounts]);

  if (!containerId) return null;
  if (loading && !container) {
    return (
      <div className="flex min-h-[320px] items-center justify-center bg-background">
        <IconLoader2 className="h-6 w-6 animate-spin" />
      </div>
    );
  }
  if (fetchError && !container) {
    return (
      <div className="flex min-h-[320px] flex-col items-center justify-center gap-3">
        <p className="text-sm text-muted-foreground">{fetchError}</p>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/containers")}>
            Back to containers
          </Button>
          <Button size="sm" onClick={() => fetchContainer()}>
            <IconRefresh className="mr-2 h-4 w-4" />
            Retry
          </Button>
        </div>
      </div>
    );
  }
  if (!container) return null;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/containers")}>
            <IconX className="mr-1 h-4 w-4" />
            Back to containers
          </Button>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">{name}</h1>
          <PageHelpPopover
            title={`Container: ${name}`}
            description="Detailed operational statistics, network port bindings, environment variables, and live logs for this container instance."
            tips={[
              "Click the Terminal icon to stream real-time standard output and error logs",
              "Use Start, Stop, or Restart buttons to change container lifecycle state",
              "Inspect published host ports to verify accessibility",
            ]}
            dockerCommands={[
              `docker inspect ${containerId || ""}`,
              `docker logs -f ${containerId || ""}`,
              `docker stop ${containerId || ""}`,
              `docker restart ${containerId || ""}`,
            ]}
          />
          <Badge variant={status === "running" ? "secondary" : "outline"} className="font-mono text-xs">
            {status}
          </Badge>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fetchContainer()} disabled={refreshing}>
            <IconRefresh className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <DockerStatusBadge docker={docker} />

      {/* Actions row */}
      <div className="flex flex-wrap gap-2">
        {status === "running" ? (
          <>
            <Button onClick={() => runAction("stop")} disabled={busy.stop || !docker.available}>
              <IconSquare className="mr-2 h-4 w-4" />
              Stop
            </Button>
            <Button onClick={() => runAction("restart")} disabled={busy.restart || !docker.available}>
              <IconRotate className="mr-2 h-4 w-4" />
              Restart
            </Button>
          </>
        ) : (
          <Button onClick={() => runAction("start")} disabled={busy.start || !docker.available}>
            <IconPower className="mr-2 h-4 w-4" />
            Start
          </Button>
        )}
        <Button variant="destructive" onClick={removeContainer} disabled={busy.remove || !docker.available}>
          <IconTrash className="mr-2 h-4 w-4" />
          Remove
        </Button>
        <Button size="icon" variant="ghost" onClick={() => setLogsOpen(true)} title="Logs" aria-label="View container logs">
          <IconTerminal className="h-4 w-4" />
        </Button>
      </div>

      {/* Stats cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Image" value={image} mono />
        <StatCard label="Created" value={new Date(created).toLocaleDateString()} />
        <StatCard label="PID" value={pid || "—"} />
        <StatCard label="Restarts" value={restartCount} />
      </div>

      <Separator />

      {/* Details grid */}
      <div className="grid gap-5 lg:grid-cols-3">
        {/* Ports */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Ports ({portList.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {portList.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No ports published</div>
            ) : (
              <div className="space-y-2">
                {portList.map((p, i) => (
                  <div key={`port-${i}`} className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
                    <div className="flex items-center gap-2">
                      <IconNetwork className="h-4 w-4 text-muted-foreground" />
                      <div>
                        <div className="font-mono text-sm">{p.private}</div>
                        <div className="text-xs text-muted-foreground">{p.type.toUpperCase()}</div>
                      </div>
                    </div>
                    <div className="font-mono text-sm">{p.public}</div>
                    <Button size="icon" variant="ghost" onClick={() => copyValue(`${p.public}:${p.private}`)}>
                      <IconCopy className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Networks */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Networks ({networkList.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {networkList.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No networks</div>
            ) : (
              <div className="space-y-2">
                {networkList.map((n, i) => (
                  <div key={`net-${i}`} className="flex items-center justify-between p-2 rounded-md border bg-muted/50">
                    <div>
                      <div className="font-mono text-sm">{n.name}</div>
                      <div className="text-xs text-muted-foreground">{n.ip}</div>
                    </div>
                    <div className="font-mono text-xs">{n.mac}</div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Mounts */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Mounts ({mountList.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {mountList.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No mounts</div>
            ) : (
              <div className="space-y-2">
                {mountList.map((m, i) => (
                  <div key={`mount-${i}`} className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
                    <div className="flex-1">
                      <div className="font-mono text-sm truncate" title={m.source}>{m.source}</div>
                      <div className="text-xs text-muted-foreground font-mono">{m.destination}</div>
                    </div>
                    <Badge variant="secondary" className="text-[10px]">
                      {m.rw ? "rw" : "ro"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Env vars */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle>Env ({env.length})</CardTitle>
          </CardHeader>
          <CardContent>
            {env.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">No env vars</div>
            ) : (
              <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
                {env.map((e: string, i) => {
                  const eq = e.indexOf("=");
                  const key = eq > 0 ? e.slice(0, eq) : e;
                  const val = eq > 0 ? e.slice(eq + 1) : "";
                  const isSecret = /pass|secret|token|key|password/i.test(key);
                  return (
                    <div key={`env-${i}`} className="flex items-start justify-between p-2 rounded-md border bg-muted/50">
                      <div className="flex-1">
                        <div className="font-mono text-xs">{key}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {isSecret ? "••••••••" : val}
                        </div>
                      </div>
                      <Button size="icon" variant="ghost" onClick={() => copyValue(val)} disabled={isSecret}>
                        <IconCopy className="h-3 w-3" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* State info */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Container state</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
              <span className="text-sm text-muted-foreground">Status</span>
              <span className="font-mono text-sm">{status}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
              <span className="text-sm text-muted-foreground">Started at</span>
              <span className="font-mono text-xs">{new Date(startedAt).toLocaleString() || "—"}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
              <span className="text-sm text-muted-foreground">Finished at</span>
              <span className="font-mono text-xs">{new Date(finishedAt).toLocaleString() || "—"}</span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
              <span className="text-sm text-muted-foreground">Exit code</span>
              <span className={`font-mono text-xs ${exitCode !== 0 && exitCode !== null ? "text-destructive" : ""}`}>
                {exitCode !== null && exitCode !== undefined ? String(exitCode) : "—"}
              </span>
            </div>
            <div className="flex items-center justify-between p-3 rounded-md border bg-muted/50">
              <span className="text-sm text-muted-foreground">OOM killed</span>
              <span className={`font-mono text-xs ${oomKilled ? "text-destructive" : ""}`}>
                {oomKilled ? "Yes" : "No"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Logs sheet: the button after Remove used to navigate to a missing route */}
      <Sheet open={logsOpen} onOpenChange={setLogsOpen}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle className="font-mono">Logs · {name}</SheetTitle>
            <SheetDescription>Live container logs</SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            {logsOpen && containerId && (
              <LogsViewer name={name} containerId={containerId} />
            )}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function DockerStatusBadge({ docker }: { docker: ReturnType<typeof useHealth> }) {
  const status = docker.status;
  const label = status === "ok" ? "Docker connected" : status === "failed" ? "Docker unavailable" : "Checking…";
  const variant = status === "ok" ? "secondary" : status === "failed" ? "destructive" : "outline";
  return (
    <Badge variant={variant} className="font-mono text-xs" title={docker.reason() ?? ""}>
      {label}
    </Badge>
  );
}

function StatCard({ label, value, mono = false }: { label: string; value: string | number; mono?: boolean }) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className={cn("text-2xl font-semibold", mono ? "font-mono" : "")}>{value}</div>
        </div>
      </div>
    </Card>
  );
}

function CardHeader({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("flex items-center justify-between border-b px-3 py-2", className)}>{children}</div>;
}

function CardTitle({ children }: { children: React.ReactNode }) {
  return <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">{children}</span>;
}

function CardContent({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn("p-3 pt-2", className)}>{children}</div>;
}
