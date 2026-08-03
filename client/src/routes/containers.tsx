import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Loader2, Play, Plus, RefreshCw, RotateCw, Rocket, Search, Square, Terminal, Trash2, X } from "lucide-react";
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
import { useWorkspaces } from "@/lib/workspace-store";
import * as yaml from "js-yaml";



interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: string;
  ports: { host?: number; container?: number; protocol: string }[];
  created: number;
}

export default function ContainersPage() {
  const { current } = useWorkspaces();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "running" | "exited" | "created">("all");
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [removeFor, setRemoveFor] = useState<DockerContainer | null>(null);
  const [logsForContainer, setLogsForContainer] = useState<DockerContainer | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [spinOpen, setSpinOpen] = useState(false);
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
        <Button size="sm" onClick={() => setSpinOpen(true)}>
          <Rocket className="mr-2 h-4 w-4" />
          Create from YAML
        </Button>
        <Button size="sm" variant="outline" onClick={() => setCreateOpen(true)}>
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

      <SpinFromYamlDialog
        open={spinOpen}
        onOpenChange={setSpinOpen}
        workspaceRoot={current?.rootFolder ?? "docker-yaml-files"}
        onSpun={async () => {
          await fetchContainers(true);
          emitSync(SYNC_EVENTS.CONTAINERS_CHANGED, { action: "spin-from-yaml" });
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

const SPIN_PLACEHOLDER = `services:
  web:
    image: nginx:alpine
    container_name: my-nginx
    ports:
      - "8080:80"
    restart: unless-stopped
`;

interface EnvRow {
  key: string;
  value: string;
}

interface ServiceRow {
  name: string;
  image: string;
  restart: string;
  ports: string[];
  volumes: string[];
  env: EnvRow[];
}

function portToString(p: any): string {
  if (typeof p === "string") return p;
  const obj = (p ?? {}) as Record<string, any>;
  const target = String(obj.target ?? "");
  const published = obj.published != null ? String(obj.published) : "";
  return published ? `${published}:${target}` : target;
}

function volumeToString(v: any): string {
  if (typeof v === "string") return v;
  const obj = (v ?? {}) as Record<string, any>;
  const source = String(obj.source ?? "");
  const target = String(obj.target ?? "");
  const mode = obj.read_only ? ":ro" : "";
  return `${source}:${target}${mode}`;
}

function envRowsFromDoc(env: any): EnvRow[] {
  if (Array.isArray(env)) {
    return env.map((e: any) => {
      const s = String(e ?? "");
      const eq = s.indexOf("=");
      if (eq === -1) return { key: s, value: "" };
      return { key: s.slice(0, eq), value: s.slice(eq + 1) };
    });
  }
  if (env && typeof env === "object") {
    return Object.entries(env).map(([k, v]) => ({ key: k, value: String(v ?? "") }));
  }
  return [];
}

function parseServices(doc: any): { services: ServiceRow[]; error: string | null } {
  if (!doc || typeof doc !== "object" || Array.isArray(doc)) {
    return { services: [], error: "YAML must contain a services section" };
  }
  const svcs = doc.services;
  if (!svcs || typeof svcs !== "object" || Array.isArray(svcs)) {
    return { services: [], error: "No 'services' section found in YAML" };
  }
  const services: ServiceRow[] = Object.entries(svcs).map(([name, raw]) => {
    const s = (raw ?? {}) as Record<string, any>;
    return {
      name,
      image: typeof s.image === "string" ? s.image : "",
      restart: typeof s.restart === "string" ? s.restart : "",
      ports: Array.isArray(s.ports) ? s.ports.map(portToString) : [],
      volumes: Array.isArray(s.volumes) ? s.volumes.map(volumeToString) : [],
      env: envRowsFromDoc(s.environment),
    };
  });
  return { services, error: null };
}

function ServiceCard({
  row,
  onRename,
  onImage,
  onRestart,
  onPorts,
  onVolumes,
  onEnv,
  onAddPort,
  onAddVolume,
  onAddEnv,
  onRemove,
}: {
  row: ServiceRow;
  onRename: (oldName: string, newName: string) => void;
  onImage: (name: string, image: string) => void;
  onRestart: (name: string, restart: string) => void;
  onPorts: (name: string, ports: string[]) => void;
  onVolumes: (name: string, volumes: string[]) => void;
  onEnv: (name: string, env: EnvRow[]) => void;
  onAddPort: (name: string) => void;
  onAddVolume: (name: string) => void;
  onAddEnv: (name: string) => void;
  onRemove: (name: string) => void;
}) {
  const [nameDraft, setNameDraft] = useState(row.name);

  useEffect(() => {
    setNameDraft(row.name);
  }, [row.name]);

  const commitName = () => {
    const next = nameDraft.trim();
    if (next && next !== row.name) onRename(row.name, next);
    else setNameDraft(row.name);
  };

  return (
    <div className="rounded-md border p-3">
      <div className="flex items-center gap-2">
        <Input
          value={nameDraft}
          onChange={(e) => setNameDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") (e.target as HTMLInputElement).blur();
          }}
          className="h-7 font-mono text-xs font-semibold"
          placeholder="service-name"
        />
        <Input
          value={row.image}
          onChange={(e) => onImage(row.name, e.target.value)}
          className="h-7 flex-1 font-mono text-xs"
          placeholder="image:tag"
        />
        <select
          value={row.restart}
          onChange={(e) => onRestart(row.name, e.target.value)}
          className="h-7 rounded-md border bg-background px-1.5 font-mono text-xs"
        >
          <option value="">no restart</option>
          <option value="no">no</option>
          <option value="always">always</option>
          <option value="unless-stopped">unless-stopped</option>
          <option value="on-failure">on-failure</option>
        </select>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
          onClick={() => onRemove(row.name)}
          title="Remove service"
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      <div className="mt-3 space-y-2.5">
        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Ports
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground"
              onClick={() => onAddPort(row.name)}
              title="Add port"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <div className="mt-1 space-y-1">
            {row.ports.map((p, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={p}
                  onChange={(e) => {
                    const next = [...row.ports];
                    next[i] = e.target.value;
                    onPorts(row.name, next);
                  }}
                  className="h-6 font-mono text-[11px]"
                  placeholder="8080:80"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onPorts(row.name, row.ports.filter((_, j) => j !== i))}
                  title="Remove port"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {row.ports.length === 0 && (
              <p className="font-mono text-[10px] text-muted-foreground">none</p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Volumes
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground"
              onClick={() => onAddVolume(row.name)}
              title="Add volume"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <div className="mt-1 space-y-1">
            {row.volumes.map((v, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={v}
                  onChange={(e) => {
                    const next = [...row.volumes];
                    next[i] = e.target.value;
                    onVolumes(row.name, next);
                  }}
                  className="h-6 font-mono text-[11px]"
                  placeholder="data:/var/lib/data"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onVolumes(row.name, row.volumes.filter((_, j) => j !== i))}
                  title="Remove volume"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {row.volumes.length === 0 && (
              <p className="font-mono text-[10px] text-muted-foreground">none</p>
            )}
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              Environment
            </span>
            <Button
              variant="ghost"
              size="icon"
              className="h-5 w-5 text-muted-foreground"
              onClick={() => onAddEnv(row.name)}
              title="Add env var"
            >
              <Plus className="h-3 w-3" />
            </Button>
          </div>
          <div className="mt-1 space-y-1">
            {row.env.map((env, i) => (
              <div key={i} className="flex items-center gap-1.5">
                <Input
                  value={env.key}
                  onChange={(e) => {
                    const next = [...row.env];
                    next[i] = { ...next[i], key: e.target.value };
                    onEnv(row.name, next);
                  }}
                  className="h-6 w-2/5 font-mono text-[11px]"
                  placeholder="KEY"
                />
                <span className="font-mono text-xs text-muted-foreground">=</span>
                <Input
                  value={env.value}
                  onChange={(e) => {
                    const next = [...row.env];
                    next[i] = { ...next[i], value: e.target.value };
                    onEnv(row.name, next);
                  }}
                  className="h-6 flex-1 font-mono text-[11px]"
                  placeholder="value"
                />
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-6 w-6 shrink-0 text-muted-foreground hover:text-destructive"
                  onClick={() => onEnv(row.name, row.env.filter((_, j) => j !== i))}
                  title="Remove env var"
                >
                  <X className="h-3 w-3" />
                </Button>
              </div>
            ))}
            {row.env.length === 0 && (
              <p className="font-mono text-[10px] text-muted-foreground">none</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function SpinFromYamlDialog({
  open,
  onOpenChange,
  workspaceRoot,
  onSpun,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspaceRoot: string;
  onSpun: () => Promise<void>;
}) {
  const [yamlContent, setYamlContent] = useState(SPIN_PLACEHOLDER);
  const [stackName, setStackName] = useState("");
  const [saving, setSaving] = useState(false);

  const doc = useMemo<any | null>(() => {
    if (!yamlContent.trim()) return null;
    try {
      const parsed: any = yaml.load(yamlContent);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      return parsed;
    } catch {
      return null;
    }
  }, [yamlContent]);

  const parsed = useMemo(() => {
    if (yamlContent.trim()) {
      try {
        return parseServices(yaml.load(yamlContent));
      } catch (e: any) {
        return { services: [], error: e.message || "Invalid YAML" };
      }
    }
    return { services: [], error: null };
  }, [yamlContent]);

  const regenerate = (mutator: (doc: any, services: Record<string, any>) => void) => {
    if (!doc) return;
    try {
      const clone: any = JSON.parse(JSON.stringify(doc));
      const services = (clone.services ?? {}) as Record<string, any>;
      mutator(clone, services);
      clone.services = services;
      setYamlContent(yaml.dump(clone, { indent: 2, lineWidth: -1 }));
    } catch {
      // ignore transient edits while typing
    }
  };

  const patchService = (name: string, field: "image" | "restart", value: string) => {
    regenerate((_doc, services) => {
      const svc = services[name] ?? {};
      if (value) svc[field] = value;
      else delete svc[field];
      services[name] = svc;
    });
  };

  const renameService = (oldName: string, newName: string) => {
    regenerate((_doc, services) => {
      if (newName === oldName || Object.prototype.hasOwnProperty.call(services, newName)) return;
      const svc = services[oldName];
      if (!svc) return;
      delete services[oldName];
      services[newName] = svc;
    });
  };

  const removeService = (name: string) => {
    regenerate((_doc, services) => {
      delete services[name];
    });
  };

  const addService = () => {
    const base = "service";
    const names = Object.keys((doc?.services ?? {}) as Record<string, any>);
    let n = names.length + 1;
    let name = `${base}-${n}`;
    while (names.includes(name)) name = `${base}-${++n}`;
    regenerate((_doc, services) => {
      services[name] = { image: "nginx:alpine" };
    });
  };

  const resolvedName = stackName.trim() || parsed.services[0]?.name || "stack";

  const totalPorts = parsed.services.reduce((n, s) => n + s.ports.length, 0);
  const totalVolumes = parsed.services.reduce((n, s) => n + s.volumes.length, 0);
  const totalEnv = parsed.services.reduce((n, s) => n + s.env.length, 0);

  const reset = () => {
    setYamlContent(SPIN_PLACEHOLDER);
    setStackName("");
    setSaving(false);
  };

  const submit = async () => {
    if (!yamlContent.trim()) {
      toast.error("Paste a docker-compose YAML first");
      return;
    }
    if (parsed.error) {
      toast.error(parsed.error);
      return;
    }
    setSaving(true);
    try {
      let clean = yamlContent;
      if (doc) {
        const clone: any = JSON.parse(JSON.stringify(doc));
        for (const svc of Object.values(clone.services ?? {})) {
          const s = svc as Record<string, any>;
          if (Array.isArray(s.ports))
            s.ports = s.ports.filter((p: any) => typeof p === "string" && p.trim());
          if (Array.isArray(s.volumes))
            s.volumes = s.volumes.filter((v: any) => typeof v === "string" && v.trim());
          if (Array.isArray(s.environment))
            s.environment = s.environment.filter(
              (e: any) => typeof e === "string" && e.includes("=") && e.slice(0, e.indexOf("=")).trim(),
            );
          if (!s.image) delete s.image;
          if (!s.restart) delete s.restart;
        }
        clean = yaml.dump(clone, { indent: 2, lineWidth: -1 });
      }
      const folder = resolvedName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
      const yamlPath = `${workspaceRoot}/${folder}/docker-compose.yml`;
      await api.composeUpFromYaml(yamlPath, clean);
      toast.success(`Stack "${folder}" spun up from YAML`);
      await onSpun();
      onOpenChange(false);
      reset();
    } catch (e: any) {
      toast.error(e.message);
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
      <DialogContent className="max-w-5xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Rocket className="h-4 w-4" strokeWidth={1.75} /> Spin stack from YAML
          </DialogTitle>
          <DialogDescription>
            Edit the details on the left or the YAML code on the right — both stay in sync — then
            spin it up with <span className="font-mono">docker compose up -d</span>.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="spin-stack-name">Stack / folder name</Label>
            <Input
              id="spin-stack-name"
              value={stackName}
              onChange={(e) => setStackName(e.target.value)}
              placeholder={parsed.services[0]?.name || "my-stack"}
              className="font-mono"
            />
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {/* Left: editable details */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex flex-wrap gap-1.5">
                  <Badge variant="secondary" className="font-mono">
                    {parsed.services.length} service{parsed.services.length === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="secondary" className="font-mono">
                    {totalPorts} port{totalPorts === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="secondary" className="font-mono">
                    {totalVolumes} volume{totalVolumes === 1 ? "" : "s"}
                  </Badge>
                  <Badge variant="secondary" className="font-mono">
                    {totalEnv} env
                  </Badge>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 font-mono text-xs"
                  disabled={!doc}
                  onClick={addService}
                >
                  <Plus className="h-3.5 w-3.5" /> Add service
                </Button>
              </div>

              {parsed.error ? (
                <div className="rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 font-mono text-xs text-destructive">
                  {parsed.error}
                </div>
              ) : parsed.services.length === 0 ? (
                <div className="grid h-48 place-items-center rounded-md border border-dashed text-xs text-muted-foreground">
                  Paste YAML to see service details
                </div>
              ) : (
                <div className="max-h-[400px] space-y-2 overflow-y-auto pr-1">
                  {parsed.services.map((s) => (
                    <ServiceCard
                      key={s.name}
                      row={s}
                      onRename={renameService}
                      onImage={(name, image) => patchService(name, "image", image)}
                      onRestart={(name, restart) => patchService(name, "restart", restart)}
                      onPorts={(name, ports) =>
                        regenerate((_d, services) => {
                          const svc = services[name] ?? {};
                          svc.ports = ports;
                          services[name] = svc;
                        })
                      }
                      onVolumes={(name, volumes) =>
                        regenerate((_d, services) => {
                          const svc = services[name] ?? {};
                          svc.volumes = volumes;
                          services[name] = svc;
                        })
                      }
                      onEnv={(name, env) =>
                        regenerate((_d, services) => {
                          const svc = services[name] ?? {};
                          svc.environment = env.map((r) => `${r.key}=${r.value}`);
                          services[name] = svc;
                        })
                      }
                      onAddPort={(name) =>
                        regenerate((_d, services) => {
                          const svc = services[name] ?? {};
                          svc.ports = [...(Array.isArray(svc.ports) ? svc.ports : []), ""];
                          services[name] = svc;
                        })
                      }
                      onAddVolume={(name) =>
                        regenerate((_d, services) => {
                          const svc = services[name] ?? {};
                          svc.volumes = [...(Array.isArray(svc.volumes) ? svc.volumes : []), ""];
                          services[name] = svc;
                        })
                      }
                      onAddEnv={(name) =>
                        regenerate((_d, services) => {
                          const svc = services[name] ?? {};
                          svc.environment = [
                            ...envRowsFromDoc(svc.environment),
                            { key: "", value: "" },
                          ].map((r) => `${r.key}=${r.value}`);
                          services[name] = svc;
                        })
                      }
                      onRemove={removeService}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Right: YAML code */}
            <div className="flex flex-col">
              <div className="flex items-center justify-between rounded-t-md border bg-muted/40 px-3 py-1.5 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
                <span>docker-compose.yml</span>
                <span>{yamlContent.split("\n").length} lines</span>
              </div>
              <Textarea
                value={yamlContent}
                onChange={(e) => setYamlContent(e.target.value)}
                spellCheck={false}
                className="min-h-[400px] flex-1 resize-y rounded-t-none font-mono text-xs leading-5"
                placeholder="services:&#10;  app:&#10;    image: nginx:alpine&#10;    ports:&#10;      - '8080:80'"
              />
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            disabled={saving || !yamlContent.trim() || !!parsed.error}
            onClick={submit}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Rocket className="h-4 w-4" strokeWidth={1.75} />
            )}
            {saving ? "Spinning up…" : "Spin up stack"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
