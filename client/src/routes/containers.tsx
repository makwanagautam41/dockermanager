import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  IconLoader2 as Loader2,
  IconPower as Play,
  IconPlus as Plus,
  IconRefresh as RefreshCw,
  IconRotate as RotateCw,
  IconRocket as Rocket,
  IconSearch as Search,
  IconSquare as Square,
  IconTerminal as Terminal,
  IconTrash as Trash2,
  IconX as X,
  IconList as List,
  IconGrid3x3 as Grid,
  IconChevronDown as ChevronDown,
  IconHelpCircle as HelpIcon,
} from "@tabler/icons-react";
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
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { LogsViewer } from "@/components/logs-viewer";
import { api } from "@/lib/api";
import { emitSync, onSync, SYNC_EVENTS, getRefreshIntervalMs } from "@/lib/utils";
import { useWorkspaces } from "@/lib/workspace-store";
import { useHealth } from "@/lib/health";
import {
  categorizeContainer,
  CATEGORIES,
  categoryColor,
  type CategorizedContainer,
  type RawContainer,
} from "@/lib/categorizer";

type DockerContainer = RawContainer;

export type { DockerContainer };

const STATUS_OPTIONS: { id: string; label: string }[] = [
  { id: "running", label: "Running" },
  { id: "exited", label: "Exited" },
  { id: "paused", label: "Paused" },
  { id: "restarting", label: "Restarting" },
  { id: "created", label: "Created" },
];

interface FilterState {
  q: string;
  category: string[];
  status: string[];
  image: string[];
  port: string[];
  created: "all" | "older-than-1month";
}

const DEFAULT_FILTER: FilterState = {
  q: "",
  category: [],
  status: [],
  image: [],
  port: [],
  created: "all",
};

function parseFilters(searchParams: URLSearchParams): FilterState {
  const getArr = (key: string): string[] =>
    searchParams.getAll(key).filter(Boolean);
  return {
    q: searchParams.get("q") ?? "",
    category: getArr("category"),
    status: getArr("status"),
    image: getArr("image"),
    port: getArr("port"),
    created: (searchParams.get("created") as FilterState["created"]) ?? "all",
  };
}

function buildSearchParams(f: FilterState): URLSearchParams {
  const p = new URLSearchParams();
  if (f.q) p.set("q", f.q);
  f.category.forEach((v) => p.append("category", v));
  f.status.forEach((v) => p.append("status", v));
  f.image.forEach((v) => p.append("image", v));
  f.port.forEach((v) => p.append("port", v));
  if (f.created !== "all") p.set("created", f.created);
  return p;
}

export default function ContainersPage() {
  const { current, pushActivity } = useWorkspaces();
  const wsId = current?.id;
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const [containers, setContainers] = useState<DockerContainer[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [removeFor, setRemoveFor] = useState<DockerContainer | null>(null);
  const [logsForContainer, setLogsForContainer] = useState<DockerContainer | null>(null);
  const [bulkOpen, setBulkOpen] = useState<{ action: string; ids: string[] } | null>(null);
  const [view, setView] = useState<"table" | "cards">("table");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" }>({
    key: "name",
    dir: "asc",
  });
  const [filterPanelOpen, setFilterPanelOpen] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const docker = useHealth("dockerEngine");

  const parsedFilters = useMemo(() => parseFilters(searchParams), [searchParams]);
  const [filter, setFilter] = useState<FilterState>(parsedFilters);

  // Persist filter state to the URL so it is shareable and survives refresh.
  useEffect(() => {
    if (searchParams.toString() === buildSearchParams(filter).toString()) return;
    setSearchParams(buildSearchParams(filter), { replace: true });
  }, [filter, searchParams, setSearchParams]);

  const fetchContainers = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = (await api.listContainers()) as DockerContainer[];
      setContainers(data);
    } catch (e: any) {
      if (!silent) toast.error(`Failed to load containers: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    fetchContainers();
    const ms = getRefreshIntervalMs();
    intervalRef.current = setInterval(() => fetchContainers(true), ms);
    const unsub = onSync(SYNC_EVENTS.CONTAINERS_CHANGED, () => fetchContainers(true));
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      unsub();
    };
  }, []);

  const distinctImages = useMemo(() => {
    const set = new Set<string>();
    containers.forEach((c) => set.add(c.image));
    return [...set].sort();
  }, [containers]);

  const categorized = useMemo(
    () => containers.map((c) => categorizeContainer(c)),
    [containers],
  );

  const filtered = useMemo(() => {
    const catSet = new Set(filter.category);
    const statusSet = new Set(filter.status);
    const imageSet = new Set(filter.image);
    const portSet = new Set(filter.port);
    const q = filter.q.toLowerCase();
    const olderThan = filter.created === "older-than-1month" ? Date.now() - 30 * 24 * 60 * 60 * 1000 : 0;

    return categorized.filter((c) => {
      if (catSet.size && !catSet.has(c.category)) return false;
      if (statusSet.size && !statusSet.has(c.status)) return false;
      if (imageSet.size && !imageSet.has(c.image)) return false;
      if (portSet.size) {
        const has = c.ports.some((p) => p.host != null && portSet.has(String(p.host)));
        if (!has) return false;
      }
      if (olderThan && c.created && c.created * 1000 < olderThan) return false;
      if (q) {
        const blob = `${c.name} ${c.image} ${c.id} ${c.ports
          .map((p) => String(p.host ?? p.container))
          .join(" ")}`.toLowerCase();
        if (!blob.includes(q)) return false;
      }
      return true;
    });
  }, [categorized, filter]);

  const sorted = useMemo(() => {
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let av: any = a[sort.key as keyof DockerContainer];
      let bv: any = b[sort.key as keyof DockerContainer];
      if (sort.key === "created") {
        av = a.created;
        bv = b.created;
      }
      if (av == null && bv == null) return 0;
      if (av == null) return dir;
      if (bv == null) return -dir;
      if (av < bv) return -dir;
      if (av > bv) return dir;
      return 0;
    });
  }, [filtered, sort]);

  const runningCount = containers.filter((c) => c.status === "running").length;

  const handleContainerClick = (c: DockerContainer) => {
    navigate(`/containers/${c.id}`);
  };

  const runAction = async (c: DockerContainer, action: "start" | "stop" | "restart") => {
    setBusy((b) => ({ ...b, [c.id]: true }));
    try {
      if (action === "start") await api.startContainer(c.id);
      else if (action === "stop") await api.stopContainer(c.id);
      else await api.restartContainer(c.id);
      const verb = action === "start" ? "started" : action === "stop" ? "stopped" : "restarted";
      toast.success(`${c.name} ${verb}`);
      if (wsId) pushActivity(wsId, { kind: action, message: `container ${action}: ${c.name}` });
      await fetchContainers(true);
      emitSync(SYNC_EVENTS.CONTAINERS_CHANGED, { action, containerId: c.id });
    } catch (e: any) {
      toast.error(e.message);
      if (wsId) pushActivity(wsId, { kind: "error", message: `failed to ${action} ${c.name}: ${e.message}` });
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }));
    }
  };

  const removeContainer = async (c: DockerContainer) => {
    setBusy((b) => ({ ...b, [c.id]: true }));
    try {
      if (c.status === "running") await api.stopContainer(c.id);
      await api.removeContainer(c.id);
      toast.success(`${c.name} removed`);
      if (wsId) pushActivity(wsId, { kind: "delete", message: `container removed: ${c.name}` });
      await fetchContainers(true);
      emitSync(SYNC_EVENTS.CONTAINERS_CHANGED, { action: "remove", containerId: c.id });
    } catch (e: any) {
      toast.error(e.message);
      if (wsId) pushActivity(wsId, { kind: "error", message: `failed to remove ${c.name}: ${e.message}` });
    } finally {
      setBusy((b) => ({ ...b, [c.id]: false }));
      setRemoveFor(null);
    }
  };

  const runBulkAction = async (action: "start" | "stop" | "restart" | "remove") => {
    const ids = [...selectedIds];
    let ok = 0;
    let fail = 0;
    for (const id of ids) {
      const c = containers.find((x) => x.id === id);
      if (!c) continue;
      try {
        if (action === "remove") {
          if (c.status === "running") await api.stopContainer(c.id);
          await api.removeContainer(c.id);
        } else if (action === "start") await api.startContainer(c.id);
        else if (action === "stop") await api.stopContainer(c.id);
        else await api.restartContainer(c.id);
        ok++;
      } catch {
        fail++;
      }
    }
    setSelectedIds(new Set());
    await fetchContainers(true);
    emitSync(SYNC_EVENTS.CONTAINERS_CHANGED, { action: "bulk" });
    toast.success(`Bulk ${action}: ${ok} succeeded${fail ? `, ${fail} failed` : ""}`);
    setBulkOpen(null);
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = (checked: boolean) => {
    setSelectedIds(checked ? new Set(sorted.map((c) => c.id)) : new Set());
  };

  const isSelected = (id: string) => selectedIds.has(id);

  const handleSaveFilter = () => {
    const name = window.prompt("Save this filter as…");
    if (!name) return;
    try {
      const saved = JSON.parse(localStorage.getItem("dm-saved-filters") ?? "[]");
      saved.push({ name, filter, createdAt: new Date().toISOString() });
      localStorage.setItem("dm-saved-filters", JSON.stringify(saved));
      toast.success(`Filter "${name}" saved`);
    } catch {
      toast.error("Failed to save filter");
    }
  };

  if (!current) return null;

  const activeCount = filter.category.length + filter.status.length + filter.image.length + filter.port.length + (filter.created !== "all" ? 1 : 0) + (filter.q ? 1 : 0);

  return (
    <div className="space-y-5">
      {/* Header with view toggle at TOP */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-semibold tracking-tight">Containers</h1>
          <p className="text-sm text-muted-foreground">
            All Docker containers on this host.{" "}
            <span className="text-emerald-500 font-medium">{runningCount} running</span>
            {" · "}
            <span className="text-muted-foreground">{containers.length - runningCount} stopped</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fetchContainers(true)} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
          <Button size="sm" onClick={() => navigate("/create/yaml")}>
            <Rocket className="mr-2 h-4 w-4" />
            Create from YAML
          </Button>
          <Button
            size="icon"
            variant={view === "table" ? "default" : "outline"}
            onClick={() => setView("table")}
            title="Table view"
          >
            <List className="h-4 w-4" />
          </Button>
          <Button
            size="icon"
            variant={view === "cards" ? "default" : "outline"}
            onClick={() => setView("cards")}
            title="Card view"
          >
            <Grid className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="outline" onClick={() => setFilterPanelOpen(true)}>
            <HelpIcon className="mr-1 h-4 w-4" />
            Filters
          </Button>
        </div>
      </div>

      <DockerStatusBadge docker={docker} />

      {/* Filter panel (right-side sheet, opens like notification drawer) */}
      <Sheet open={filterPanelOpen} onOpenChange={setFilterPanelOpen}>
        <SheetContent side="right" className="w-full sm:max-w-[420px] p-6">
          <SheetHeader>
            <SheetTitle>Filters</SheetTitle>
            <SheetDescription>
              Filter containers by category, status, image, and port.
            </SheetDescription>
          </SheetHeader>
          <div className="space-y-5">
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-2 block">
                Search
              </Label>
              <Input
                value={filter.q}
                onChange={(e) => setFilter((f) => ({ ...f, q: e.target.value }))}
                placeholder="Search name, image, port, ID…"
              />
            </div>

            <Separator className="my-3" />
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
                Category
              </Label>
              <ScrollArea className="h-[200px]">
                <div className="space-y-1.5">
                  {CATEGORIES.map((cat) => {
                    const active = filter.category.includes(cat);
                    return (
                      <label key={`cat-${cat}`} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer select-none transition-colors hover:bg-accent/50">
                        <Checkbox checked={active} onCheckedChange={() => setFilter((f) => ({ ...f, category: toggleItem(f.category, cat) }))} />
                        <span className="truncate">{cat}</span>
                      </label>
                    );
                  })}
                </div>
              </ScrollArea>
            </div>

            <Separator className="my-3" />
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
                Status
              </Label>
              <div className="space-y-1.5">
                {STATUS_OPTIONS.map((s) => (
                  <label key={`status-${s.id}`} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer select-none transition-colors hover:bg-accent/50">
                    <Checkbox
                      checked={filter.status.includes(s.id)}
                      onCheckedChange={() => setFilter((f) => ({ ...f, status: toggleItem(f.status, s.id) }))}
                    />
                    <span className="truncate">{s.label}</span>
                  </label>
                ))}
              </div>
            </div>

            <Separator className="my-3" />
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground mb-3 block">
                Image
              </Label>
              <div className="space-y-1.5">
                {distinctImages.map((img) => (
                  <label key={`img-${img}`} className="flex items-center gap-2 rounded-md px-3 py-2 text-sm cursor-pointer select-none transition-colors hover:bg-accent/50">
                    <Checkbox
                      checked={filter.image.includes(img)}
                      onCheckedChange={() => setFilter((f) => ({ ...f, image: toggleItem(f.image, img) }))}
                    />
                    <span className="font-mono text-xs truncate">{img}</span>
                  </label>
                ))}
              </div>
            </div>

            <Separator className="my-3" />
            <div className="flex items-center gap-2">
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                Older than 1 month
              </Label>
              <Button
                size="sm"
                variant={filter.created === "older-than-1month" ? "default" : "outline"}
                onClick={() => setFilter((f) => ({ ...f, created: f.created === "older-than-1month" ? "all" : "older-than-1month" }))}
              >
                {filter.created === "older-than-1month" ? "On" : "Off"}
              </Button>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-between">
            {activeCount > 0 && (
              <Button size="sm" variant="outline" onClick={() => setFilter(DEFAULT_FILTER)}>
                <X className="mr-1.5 h-3 w-3" stroke={1.5} /> Clear all
              </Button>
            )}
            <Button onClick={() => setFilterPanelOpen(false)}>Done</Button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Active filter chips (inline, below header) */}
      {activeCount > 0 && (
        <div className="flex flex-wrap gap-2 px-2">
          <span className="text-xs text-muted-foreground mr-2">Active: </span>
          {filter.category.map((c) => (
            <Chip key={`chip-cat-${c}`} label={c} onRemove={() => setFilter((f) => ({ ...f, category: f.category.filter((x) => x !== c) }))} />
          ))}
          {filter.status.map((c) => (
            <Chip key={`chip-st-${c}`} label={c} onRemove={() => setFilter((f) => ({ ...f, status: f.status.filter((x) => x !== c) }))} />
          ))}
          {filter.image.map((c) => (
            <Chip key={`chip-im-${c}`} label={c} onRemove={() => setFilter((f) => ({ ...f, image: f.image.filter((x) => x !== c) }))} />
          ))}
          {filter.port.map((c) => (
            <Chip key={`chip-pt-${c}`} label={`port ${c}`} onRemove={() => setFilter((f) => ({ ...f, port: f.port.filter((x) => x !== c) }))} />
          ))}
          {filter.created !== "all" && (
            <Chip label="older than 1 month" onRemove={() => setFilter((f) => ({ ...f, created: "all" }))} />
          )}
          {filter.q && (
            <Chip label={`search "${filter.q}"`} onRemove={() => setFilter((f) => ({ ...f, q: "" }))} />
          )}
          <Button size="sm" variant="outline" onClick={() => setFilter(DEFAULT_FILTER)}>
            <X className="mr-1.5 h-3 w-3" stroke={1.5} /> Clear all
          </Button>
          {filtered.length > 0 && (
            <Button size="sm" variant="outline" onClick={handleSaveFilter}>
              <HelpMenuIcon className="mr-1.5 h-3 w-3" /> Save filter
            </Button>
          )}
        </div>
      )}

      {/* Bulk action bar */}
      {selectedIds.size > 0 && (
        <Card className="p-3 border-l-2 border-primary">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium text-foreground">
              {selectedIds.size} container{selectedIds.size > 1 ? "s" : ""} selected
            </span>
            <Button size="sm" onClick={() => setBulkOpen({ action: "start", ids: [...selectedIds] })} disabled={!docker.available}>
              Start
            </Button>
            <Button size="sm" onClick={() => setBulkOpen({ action: "stop", ids: [...selectedIds] })} disabled={!docker.available}>
              Stop
            </Button>
            <Button size="sm" onClick={() => setBulkOpen({ action: "restart", ids: [...selectedIds] })} disabled={!docker.available}>
              Restart
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setBulkOpen({ action: "remove", ids: [...selectedIds] })}>
              Remove
            </Button>
            <Button size="sm" variant="outline" onClick={() => setSelectedIds(new Set())}>
              Clear selection
            </Button>
            <span className="ml-auto text-xs text-muted-foreground">
              Docker {docker.available ? "connected" : "unavailable — actions disabled"}
            </span>
          </div>
        </Card>
      )}

      <BulkConfirm
        open={!!bulkOpen}
        action={bulkOpen?.action ?? ""}
        count={selectedIds.size}
        onConfirm={() => runBulkAction(bulkOpen!.action as any)}
        onCancel={() => setBulkOpen(null)}
        disabled={!docker.available}
        reason={docker.available ? undefined : "Docker engine is not reachable"}
      />

      <Card>
        {loading ? (
          <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span className="text-sm">Loading containers from Docker…</span>
          </div>
        ) : sorted.length === 0 ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            No containers match your filters.
          </div>
        ) : view === "table" ? (
          <ContainerTable
            containers={sorted}
            runAction={runAction}
            removeContainer={removeContainer}
            setLogsForContainer={setLogsForContainer}
            toggleSelect={toggleSelect}
            selectAll={selectAll}
            isSelected={isSelected}
            sort={sort}
            setSort={setSort}
            dockerAvailable={docker.available}
            onContainerClick={handleContainerClick}
          />
        ) : (
          <ContainerCards
            containers={sorted}
            runAction={runAction}
            removeContainer={removeContainer}
            setLogsForContainer={setLogsForContainer}
            toggleSelect={toggleSelect}
            selectAll={selectAll}
            isSelected={isSelected}
            dockerAvailable={docker.available}
            onContainerClick={handleContainerClick}
          />
        )}
      </Card>

      {/* Logs sheet */}
      <Sheet open={!!logsForContainer} onOpenChange={(v) => !v && setLogsForContainer(null)}>
        <SheetContent side="right" className="w-full sm:max-w-2xl">
          <SheetHeader>
            <SheetTitle>Logs · {logsForContainer?.name}</SheetTitle>
          </SheetHeader>
          <div className="mt-4">
            {logsForContainer && <LogsViewer name={logsForContainer.name} containerId={logsForContainer.id} />}
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
    </div>
  );
}

function toggleItem(arr: string[], value: string): string[] {
  return arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
}

function Chip({ label, onRemove }: { label: string; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-input bg-muted px-2 py-1 text-xs">
      <span className="truncate mr-1">{label}</span>
      <Button size="icon" variant="ghost" className="h-5 w-5 p-0 text-[10px]" onClick={onRemove} aria-label={`Remove ${label}`}>
        <X className="h-3 w-3" stroke={1.75} />
      </Button>
    </span>
  );
}

function DockerStatusBadge({ docker }: { docker: ReturnType<typeof useHealth> }) {
  const status = docker.status;
  const label = status === "ok" ? "Docker connected" : status === "failed" ? "Docker unavailable" : "Checking Docker…";
  const variant = status === "ok" ? "secondary" : status === "failed" ? "destructive" : "outline";
  return (
    <Badge variant={variant} className="font-mono text-xs" title={docker.reason() ?? ""}>
      {label}
    </Badge>
  );
}

function ColumnHeader({
  dataKey,
  label,
  sort,
  setSort,
}: {
  dataKey: string;
  label: string;
  sort: { key: string; dir: "asc" | "desc" };
  setSort: (s: { key: string; dir: "asc" | "desc" }) => void;
}) {
  const active = sort.key === dataKey;
  const dir = active ? sort.dir : "asc";
  return (
    <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground cursor-pointer select-none" onClick={() => setSort({ key: dataKey, dir: active && dir === "asc" ? "desc" : "asc" })}>
      {label}
      {active && (dir === "asc" ? <span className="ml-1 text-xs">▲</span> : <span className="ml-1 text-xs">▼</span>)}
    </TableHead>
  );
}

function ContainerTable({
  containers,
  runAction,
  removeContainer,
  setLogsForContainer,
  toggleSelect,
  selectAll,
  isSelected,
  sort,
  setSort,
  dockerAvailable,
  onContainerClick,
}: {
  containers: CategorizedContainer[];
  runAction: (c: DockerContainer, action: "start" | "stop" | "restart") => void;
  removeContainer: (c: DockerContainer) => void;
  setLogsForContainer: (c: DockerContainer) => void;
  toggleSelect: (id: string) => void;
  selectAll: (checked: boolean) => void;
  isSelected: (id: string) => boolean;
  sort: { key: string; dir: "asc" | "desc" };
  setSort: (s: { key: string; dir: "asc" | "desc" }) => void;
  dockerAvailable: boolean;
  onContainerClick: (c: DockerContainer) => void;
}) {
  const allSelected = containers.length > 0 && containers.every((c) => isSelected(c.id));
  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-10">
              <Checkbox checked={allSelected} onCheckedChange={selectAll} />
            </TableHead>
            <ColumnHeader dataKey="name" label="Name" sort={sort} setSort={setSort} />
            <ColumnHeader dataKey="image" label="Image" sort={sort} setSort={setSort} />
            <ColumnHeader dataKey="category" label="Category" sort={sort} setSort={setSort} />
            <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Status</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground">Ports</TableHead>
            <TableHead className="text-[10px] uppercase tracking-wider text-muted-foreground text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {containers.map((c) => {
            const sel = isSelected(c.id);
            return (
              <TableRow key={c.id} className="cursor-pointer hover:bg-accent transition-colors" onClick={() => onContainerClick(c)}>
                <TableCell className="w-10">
                  <Checkbox checked={sel} onCheckedChange={() => toggleSelect(c.id)} />
                </TableCell>
                <TableCell className="font-medium font-mono text-sm">{c.name}</TableCell>
                <TableCell className="font-mono text-xs text-muted-foreground max-w-[160px] truncate">{c.image}</TableCell>
                <TableCell>
                  <Badge variant="secondary" className={`${categoryColor(c.category)}`}>
                    {c.category}
                  </Badge>
                </TableCell>
                <TableCell>
                  <ContainerStatusBadge status={c.status} state={c.state} />
                </TableCell>
                <TableCell>
                  <div className="flex flex-wrap gap-1">{portBadges(c)}</div>
                  {(!c.ports || c.ports.filter((p) => p.host).length === 0) && <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    {c.status !== "running" ? (
                      <Button size="icon" variant="ghost" disabled={!dockerAvailable} onClick={(e) => { e.stopPropagation(); runAction(c, "start"); }} title="Start">
                        <Play className="h-4 w-4" />
                      </Button>
                    ) : (
                      <Button size="icon" variant="ghost" disabled={!dockerAvailable} onClick={(e) => { e.stopPropagation(); runAction(c, "stop"); }} title="Stop">
                        <Square className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="icon" variant="ghost" disabled={!dockerAvailable} onClick={(e) => { e.stopPropagation(); runAction(c, "restart"); }} title="Restart">
                      <RotateCw className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setLogsForContainer(c); }} title="Logs">
                      <Terminal className="h-4 w-4" />
                    </Button>
                    <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeContainer(c); }} title="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}

function ContainerStatusBadge({ status, state }: { status: string; state?: string }) {
  const isRunning = status === "running";
  const dot = isRunning ? "bg-emerald-500" : "bg-slate-400";
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2 w-2 rounded-full ${dot} ${isRunning ? "animate-pulse" : ""}`} />
      <span className="text-xs font-mono capitalize">{state || status}</span>
    </div>
  );
}

function portBadges(c: DockerContainer) {
  return c.ports
    .filter((p) => p.host)
    .map((p, i) => (
      <Badge key={`port-${i}`} variant="secondary" className="font-mono text-xs">
        {p.host}:{p.container}
      </Badge>
    ));
}

function ContainerCards({
  containers,
  runAction,
  removeContainer,
  setLogsForContainer,
  toggleSelect,
  selectAll,
  isSelected,
  dockerAvailable,
  onContainerClick,
}: {
  containers: CategorizedContainer[];
  runAction: (c: DockerContainer, action: "start" | "stop" | "restart") => void;
  removeContainer: (c: DockerContainer) => void;
  setLogsForContainer: (c: DockerContainer) => void;
  toggleSelect: (id: string) => void;
  selectAll: (checked: boolean) => void;
  isSelected: (id: string) => boolean;
  dockerAvailable: boolean;
  onContainerClick: (c: DockerContainer) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {containers.map((c) => (
        <Card key={c.id} className="p-3 cursor-pointer hover:border-primary/50 transition-colors" onClick={() => onContainerClick(c)}>
          <div className="flex items-center justify-between mb-2">
            <Checkbox checked={isSelected(c.id)} onCheckedChange={() => toggleSelect(c.id)} />
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" disabled={!dockerAvailable} onClick={(e) => { e.stopPropagation(); runAction(c, c.status === "running" ? "stop" : "start"); }} title={c.status === "running" ? "Stop" : "Start"}>
                {c.status === "running" ? <Square className="h-4 w-4" /> : <Play className="h-4 w-4" />}
              </Button>
              <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setLogsForContainer(c); }} title="Logs">
                <Terminal className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 mb-2">
            <span className="font-mono text-sm font-semibold truncate">{c.name}</span>
            <Badge variant="secondary" className={`${categoryColor(c.category)} text-[10px]`}>{c.category}</Badge>
          </div>
          <div className="space-y-1 text-xs text-muted-foreground mb-3">
            <div className="flex justify-between">
              <span>Image</span>
              <span className="font-mono truncate max-w-[120px]">{c.image}</span>
            </div>
            <div className="flex justify-between">
              <span>Status</span>
              <span>{c.state || c.status}</span>
            </div>
          </div>
          <div className="flex flex-wrap gap-1 mb-3">{portBadges(c)}</div>
          <div className="flex justify-end gap-1">
            <Button size="icon" variant="ghost" disabled={!dockerAvailable} onClick={(e) => { e.stopPropagation(); runAction(c, "restart"); }} title="Restart">
              <RotateCw className="h-4 w-4" />
            </Button>
            <Button size="icon" variant="ghost" className="text-destructive hover:text-destructive" onClick={(e) => { e.stopPropagation(); removeContainer(c); }} title="Remove">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      ))}
    </div>
  );
}

function BulkConfirm({
  open,
  action,
  count,
  onConfirm,
  onCancel,
  disabled,
  reason,
}: {
  open: boolean;
  action: string;
  count: number;
  onConfirm: () => void;
  onCancel: () => void;
  disabled: boolean;
  reason?: string;
}) {
  if (!open) return null;
  return (
    <AlertDialog open={open} onOpenChange={onCancel}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Bulk {action} {count} container{count > 1 ? "s" : ""}?</AlertDialogTitle>
          <AlertDialogDescription>
            {disabled ? reason : `This will ${action} ${count} selected container{count > 1 ? "s" : ""}.`}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={disabled}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            onClick={onConfirm}
          >
            {disabled ? "Unavailable" : `Confirm ${action}`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function HelpMenuIcon({ className }: { className?: string }) {
  return <HelpIcon className={className} />;
}
