import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, RefreshCw, RotateCw, Search, Square, Terminal, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StatusBadge } from "@/components/status-badge";
import { LogsViewer } from "@/components/logs-viewer";
import { api } from "@/lib/api";
import { emitSync, onSync, SYNC_EVENTS } from "@/lib/utils";

export const Route = createFileRoute("/_app/containers")({
  component: ContainersPage,
  head: () => ({
    meta: [
      { title: "Containers · Docker Manager" },
      { name: "description", content: "All running and stopped Docker containers." },
    ],
  }),
});

interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: { host?: number; container?: number; protocol: string }[];
  created: number;
}

function ContainersPage() {
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "running" | "exited" | "created">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [removeFor, setRemoveFor] = useState<DockerContainer | null>(null);
  const [logsForContainer, setLogsForContainer] = useState<DockerContainer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const fetchContainers = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = await api.listContainers();
      setContainers(data as any);
    } catch (e: any) {
      if (!silent) toast.error(`Failed to load containers: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchContainers();
    intervalRef.current = setInterval(() => fetchContainers(true), 5000);
    const unsub = onSync(SYNC_EVENTS.CONTAINERS_CHANGED, () => fetchContainers(true));
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      unsub();
    };
  }, []);

  const filtered = useMemo(() => {
    return containers.filter((c) => {
      const state = c.status ?? "";
      if (filter === "running" && state !== "running") return false;
      if (filter === "exited" && state !== "exited") return false;
      if (filter === "created" && state !== "created") return false;
      if (
        q &&
        !c.name.toLowerCase().includes(q.toLowerCase()) &&
        !c.image.toLowerCase().includes(q.toLowerCase())
      )
        return false;
      return true;
    });
  }, [containers, filter, q]);

  const runAction = async (c: DockerContainer, action: "start" | "stop" | "restart") => {
    setBusy((b) => ({ ...b, [c.id]: true }));
    try {
      if (action === "start") await api.startContainer(c.id);
      else if (action === "stop") await api.stopContainer(c.id);
      else await api.restartContainer(c.id);
      toast.success(
        `${c.name} ${action === "start" ? "started" : action === "stop" ? "stopped" : "restarted"}`,
      );
      await fetchContainers(true);
      emitSync(SYNC_EVENTS.CONTAINERS_CHANGED, { action, containerId: c.id });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }));
    }
  };

  const removeContainer = async (c: DockerContainer) => {
    setBusy((b) => ({ ...b, [c.id]: true }));
    try {
      // Stop it first if running
      if (c.status === "running") await api.stopContainer(c.id);
      await api.removeContainer(c.id);
      toast.success(`${c.name} removed`);
      await fetchContainers(true);
      emitSync(SYNC_EVENTS.CONTAINERS_CHANGED, { action: "remove", containerId: c.id });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }));
      setRemoveFor(null);
    }
  };

  const runningCount = containers.filter((c) => c.status === "running").length;
  const stoppedCount = containers.filter((c) => c.status !== "running").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Containers</h1>
          <p className="text-sm text-muted-foreground">
            All Docker containers on this host.{" "}
            <span className="text-emerald-500 font-medium">{runningCount} running</span>
            {" · "}
            <span className="text-muted-foreground">{stoppedCount} stopped</span>
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => fetchContainers(true)}
          disabled={refreshing}
        >
          <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
          Refresh
        </Button>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Create container
        </Button>
      </div>

      <Card className="p-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="relative w-full sm:w-72">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name or image…"
              className="pl-8"
            />
          </div>
          <Tabs value={filter} onValueChange={(v) => setFilter(v as any)}>
            <TabsList>
              <TabsTrigger value="all">All ({containers.length})</TabsTrigger>
              <TabsTrigger value="running">Running ({runningCount})</TabsTrigger>
              <TabsTrigger value="exited">Exited ({stoppedCount})</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </Card>

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading containers from Docker…</span>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Image</TableHead>
                  <TableHead>Ports</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((c) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium font-mono text-sm">{c.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground max-w-[180px] truncate">
                      {c.image}
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-wrap gap-1">
                        {c.ports
                          ?.filter((p) => p.host)
                          .map((p, i) => (
                            <Badge key={i} variant="secondary" className="font-mono text-xs">
                              {p.host}:{p.container}
                            </Badge>
                          ))}
                        {(!c.ports || c.ports.filter((p) => p.host).length === 0) && (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      <ContainerStatusBadge status={c.status} state={c.state} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        {c.status !== "running" ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={busy[c.id]}
                            onClick={() => runAction(c, "start")}
                            title="Start"
                          >
                            {busy[c.id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Play className="h-4 w-4" />
                            )}
                          </Button>
                        ) : (
                          <Button
                            size="icon"
                            variant="ghost"
                            disabled={busy[c.id]}
                            onClick={() => runAction(c, "stop")}
                            title="Stop"
                          >
                            {busy[c.id] ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Square className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={busy[c.id]}
                          onClick={() => runAction(c, "restart")}
                          title="Restart"
                        >
                          <RotateCw className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          onClick={() => setLogsForContainer(c)}
                          title="Logs"
                        >
                          <Terminal className="h-4 w-4" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setRemoveFor(c)}
                          title="Remove"
                          disabled={busy[c.id]}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {filtered.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={5}>
                      <div className="py-12 text-center text-sm text-muted-foreground">
                        {containers.length === 0
                          ? "No Docker containers found. Create one to start managing it here."
                          : "No containers match your filters."}
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      {/* Logs sheet */}
      <Sheet open={!!logsForContainer} onOpenChange={(v) => !v && setLogsForContainer(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Logs · {logsForContainer?.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {logsForContainer && (
              <LogsViewer name={logsForContainer.name} containerId={logsForContainer.id} />
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* Remove confirm */}
      <AlertDialog open={!!removeFor} onOpenChange={(v) => !v && setRemoveFor(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {removeFor?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This will stop and remove the container. The image will not be deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => removeFor && removeContainer(removeFor)}
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <CreateContainerDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        onCreated={async () => {
          await fetchContainers(true);
        }}
      />
    </div>
  );
}

function ContainerStatusBadge({ status, state }: { status: string; state: string }) {
  const isRunning = status === "running";
  const isExited = status === "exited";
  const dot = isRunning ? "bg-emerald-500" : isExited ? "bg-slate-400" : "bg-amber-500";
  const label = state || status;

  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot} ${isRunning ? "animate-pulse" : ""}`} />
      <span className="text-xs font-mono capitalize">{label}</span>
    </div>
  );
}

function parseCommand(value: string): string[] | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) return parsed.map((part) => String(part));
  } catch {}
  return trimmed
    .split(/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function parseEnv(value: string): Record<string, string> | undefined {
  const entries = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const idx = line.indexOf("=");
      if (idx < 1) return null;
      return [line.slice(0, idx).trim(), line.slice(idx + 1).trim()] as const;
    })
    .filter((entry): entry is readonly [string, string] => Boolean(entry));
  if (entries.length === 0) return undefined;
  return Object.fromEntries(entries);
}

function parseVolumes(value: string): string[] | undefined {
  const entries = value
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => line.includes(":"));
  return entries.length > 0 ? entries : undefined;
}

function CreateContainerDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: () => Promise<void>;
}) {
  const [image, setImage] = useState("nginx:alpine");
  const [name, setName] = useState("");
  const [port, setPort] = useState("8080");
  const [env, setEnv] = useState("");
  const [volumes, setVolumes] = useState("");
  const [command, setCommand] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setImage("nginx:alpine");
    setName("");
    setPort("8080");
    setEnv("");
    setVolumes("");
    setCommand("");
  };

  const submit = async () => {
    if (!image.trim()) {
      toast.error("Image is required");
      return;
    }
    setSaving(true);
    try {
      const created = await api.createContainer({
        image: image.trim(),
        name: name.trim() || undefined,
        port: port.trim() ? Number.parseInt(port, 10) : undefined,
        env: parseEnv(env),
        volumes: parseVolumes(volumes),
        cmd: parseCommand(command),
      });
      toast.success(`Container ${created.name} created`);
      await onCreated();
      onOpenChange(false);
      reset();
      emitSync(SYNC_EVENTS.CONTAINERS_CHANGED, { action: "create", containerId: created.id });
    } catch (e: any) {
      toast.error(`Failed to create container: ${e.message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next);
        if (!next) reset();
      }}
    >
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create container</DialogTitle>
          <DialogDescription>
            Spin up a container directly from an image without going through the stack screen.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="container-image">Image</Label>
            <Input
              id="container-image"
              value={image}
              onChange={(e) => setImage(e.target.value)}
              placeholder="nginx:alpine"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="container-name">Name</Label>
            <Input
              id="container-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="my-container"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="container-port">Port</Label>
            <Input
              id="container-port"
              value={port}
              onChange={(e) => setPort(e.target.value)}
              placeholder="8080"
              className="font-mono"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="container-command">Command</Label>
            <Input
              id="container-command"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              placeholder='["nginx", "-g", "daemon off;"]'
              className="font-mono"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="container-env">Environment</Label>
            <Textarea
              id="container-env"
              value={env}
              onChange={(e) => setEnv(e.target.value)}
              placeholder="KEY=value\nANOTHER=value"
              className="min-h-24 font-mono"
            />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label htmlFor="container-volumes">Volumes</Label>
            <Textarea
              id="container-volumes"
              value={volumes}
              onChange={(e) => setVolumes(e.target.value)}
              placeholder="./data:/data\nlogs:/var/log/app"
              className="min-h-24 font-mono"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={saving || !image.trim()} onClick={submit}>
            {saving ? "Creating…" : "Create container"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
