import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  IconNetwork,
  IconLoader2,
  IconRefresh,
  IconSearch,
  IconShieldOff,
  IconLink,
  IconActivity,
  IconUsers,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { api } from "@/lib/api";
import { useHealth } from "@/lib/health";
import { cn } from "@/lib/utils";

interface NetworkRow {
  id: string;
  name: string;
  driver: string;
  scope: string;
  subnet: string;
  gateway: string;
  internal: boolean;
  containerCount: number;
  composeProject?: string;
}

export default function NetworksPage() {
  const docker = useHealth("dockerEngine");
  const [networks, setNetworks] = useState<NetworkRow[]>([]);
  const [containers, setContainers] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [q, setQ] = useState("");
  const [selectedNetwork, setSelectedNetwork] = useState<NetworkRow | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [connectNetwork, setConnectNetwork] = useState<NetworkRow | null>(null);
  const [connectContainer, setConnectContainer] = useState<string | null>(null);
  const [disconnectNetwork, setDisconnectNetwork] = useState<NetworkRow | null>(null);
  const [disconnectContainer, setDisconnectContainer] = useState<string | null>(null);

  const fetchNetworks = async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    try {
      const data = (await api.listNetworks()) as any[];
      setNetworks(
        data.map((n) => {
          const ipam = n.ipam?.Config?.[0] ?? {};
          const containersCount = Object.values(n.containers ?? {}).length;
          const labels = n.labels ?? {};
          return {
            id: n.id,
            name: n.name,
            driver: n.driver,
            scope: n.scope,
            subnet: ipam.Subnet || "—",
            gateway: ipam.Gateway || "—",
            internal: n.internal ?? false,
            containerCount: containersCount,
            composeProject: labels["com.docker.compose.project"] || undefined,
          };
        }),
      );
    } catch (e: any) {
      if (!silent) toast.error(`Failed to load networks: ${e.message}`);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const fetchContainers = async () => {
    try {
      const data = (await api.listContainers()) as any[];
      setContainers(data.map((c) => ({ id: c.id, name: c.name })));
    } catch {}
  };

  useEffect(() => {
    fetchNetworks();
    fetchContainers();
    const t = setInterval(() => fetchNetworks(true), 10000);
    return () => clearInterval(t);
  }, []);

  const filtered = useMemo(() => {
    const query = q.toLowerCase();
    return networks.filter(
      (n) =>
        n.name.toLowerCase().includes(query) ||
        n.driver.toLowerCase().includes(query) ||
        n.scope.toLowerCase().includes(query) ||
        (n.composeProject?.toLowerCase().includes(query) ?? false),
    );
  }, [networks, q]);

  const internalCount = networks.filter((n) => n.internal).length;
  const bridgeCount = networks.filter((n) => n.name === "bridge").length;
  const totalContainers = networks.reduce((sum, n) => sum + n.containerCount, 0);

  const doConnect = async () => {
    if (!connectNetwork || !connectContainer) return;
    try {
      await api.connectContainerToNetwork(connectNetwork.id, connectContainer);
      toast.success(`Connected ${connectContainer} to ${connectNetwork.name}`);
      setConnectNetwork(null);
      setConnectContainer(null);
      await fetchNetworks(true);
      await fetchContainers();
    } catch (e: any) {
      toast.error(`Failed to connect: ${e.message}`);
    }
  };

  const doDisconnect = async () => {
    if (!disconnectNetwork || !disconnectContainer) return;
    try {
      await api.disconnectContainerFromNetwork(disconnectNetwork.id, disconnectContainer);
      toast.success(`Disconnected ${disconnectContainer} from ${disconnectNetwork.name}`);
      setDisconnectNetwork(null);
      setDisconnectContainer(null);
      await fetchNetworks(true);
      await fetchContainers();
    } catch (e: any) {
      toast.error(`Failed to disconnect: ${e.message}`);
    }
  };

  const networkContainers = useMemo(() => {
    if (!selectedNetwork) return [];
    const ids = Object.keys(selectedNetwork as any) ? [] : [];
    // We don't have container details from network inspect in the list view,
    // so show count only. Users can inspect via container page.
    return [];
  }, [selectedNetwork]);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Networks</h1>
          <p className="text-sm text-muted-foreground">
            Docker networks on this host. {totalContainers} container connection{totalContainers !== 1 ? "s" : ""} across {networks.length} network{networks.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => fetchNetworks(true)} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>
      </div>

      <DockerStatusBadge docker={docker} />

      {/* Stats row */}
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard label="Networks" value={networks.length} sub="total on host" />
        <StatCard label="Bridge" value={bridgeCount} sub="default network" tone="muted" />
        <StatCard label="Internal" value={internalCount} sub="isolated from host" tone="warning" />
      </div>

      {/* Search + List */}
      <Card className="overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 p-4 border-b">
          <div className="relative w-full sm:w-96 flex-1">
            <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search networks by name, driver, scope…"
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {filtered.length} of {networks.length}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          {loading ? (
            <div className="flex items-center justify-center py-16 gap-2 text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin" />
              <span className="text-sm">Loading networks…</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No networks match your search.
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Scope</TableHead>
                  <TableHead>Subnet</TableHead>
                  <TableHead>Gateway</TableHead>
                  <TableHead className="text-center">Containers</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.map((n) => (
                  <TableRow key={n.id} className="cursor-pointer hover:bg-accent transition-colors" onClick={() => setSelectedNetwork(n)}>
                    <TableCell className="font-medium font-mono text-sm">{n.name}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{n.driver}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{n.scope}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{n.subnet}</TableCell>
                    <TableCell className="font-mono text-xs text-muted-foreground">{n.gateway}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant="outline" className="font-mono text-xs">
                        {n.containerCount}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <Button size="icon" variant="ghost" onClick={(e) => { e.stopPropagation(); setSelectedNetwork(n); }}>
                        <IconLink className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </Card>

      {/* Insights */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <InsightCard
          title="Default bridge"
          value={bridgeCount}
          subtitle="Containers on bridge have no DNS name resolution"
          icon={<IconShieldOff className="h-4 w-4" />}
          tone="warning"
        />
        <InsightCard
          title="Internal networks"
          value={internalCount}
          subtitle="Not accessible from the host"
          icon={<IconShieldOff className="h-4 w-4" />}
          tone="muted"
        />
        <InsightCard
          title="Connected containers"
          value={totalContainers}
          subtitle="Total container network attachments"
          icon={<IconUsers className="h-4 w-4" />}
          tone="success"
        />
      </div>

      {/* Network detail dialog */}
      <Dialog open={detailOpen && !!selectedNetwork} onOpenChange={(o) => { setDetailOpen(o); if (!o) setSelectedNetwork(null); }}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <IconNetwork className="h-4 w-4" /> {selectedNetwork?.name}
            </DialogTitle>
            <AlertDialogDescription>{selectedNetwork?.driver} · {selectedNetwork?.scope}</AlertDialogDescription>
          </DialogHeader>
          <div className="py-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <InfoRow label="ID" value={selectedNetwork?.id || "—"} mono />
              <InfoRow label="Driver" value={selectedNetwork?.driver || "—"} />
              <InfoRow label="Scope" value={selectedNetwork?.scope || "—"} />
              <InfoRow label="Subnet" value={selectedNetwork?.subnet || "—"} />
              <InfoRow label="Gateway" value={selectedNetwork?.gateway || "—"} />
              <InfoRow label="Internal" value={selectedNetwork?.internal ? "Yes" : "No"} />
              <InfoRow label="Compose project" value={selectedNetwork?.composeProject || "—"} />
              <InfoRow label="Connected containers" value={String(selectedNetwork?.containerCount || 0)} />
            </div>
            <Separator />
            <div className="flex items-center justify-between">
              <span className="font-medium">Connect a container</span>
              <div className="flex gap-2">
                <Select
                  value={connectContainer || ""}
                  onValueChange={setConnectContainer}
                  disabled={!connectNetwork || !docker.available}
                >
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Select container…" />
                  </SelectTrigger>
                  <SelectContent>
                    {containers.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  onClick={doConnect}
                  disabled={!connectNetwork || !connectContainer || !docker.available}
                >
                  Connect
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDetailOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Connect dialog (triggered from table) */}
      <Dialog open={!!connectNetwork} onOpenChange={(o) => { if (!o) { setConnectNetwork(null); setConnectContainer(null); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Connect container to {connectNetwork?.name}</DialogTitle>
            <AlertDialogDescription>Select a container to connect to this network.</AlertDialogDescription>
          </DialogHeader>
          <div className="p-4 space-y-4">
            <Select
              value={connectContainer || ""}
              onValueChange={setConnectContainer}
              disabled={!docker.available}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select container…" />
              </SelectTrigger>
              <SelectContent>
                {containers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setConnectNetwork(null); setConnectContainer(null); }}>Cancel</Button>
            <Button onClick={doConnect} disabled={!connectContainer || !docker.available}>Connect</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Disconnect dialog */}
      <AlertDialog open={!!disconnectNetwork} onOpenChange={(o) => { if (!o) { setDisconnectNetwork(null); setDisconnectContainer(null); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disconnect container from {disconnectNetwork?.name}</AlertDialogTitle>
            <AlertDialogDescription>Are you sure you want to disconnect this container?</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={doDisconnect}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!disconnectContainer}
            >
              Disconnect
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function RefreshCw({ className }: { className?: string }) {
  return <IconRefresh className={className} />;
}

function Loader2({ className }: { className?: string }) {
  return <IconLoader2 className={className} />;
}

function SearchIcon({ className }: { className?: string }) {
  return <IconSearch className={className} />;
}

function IconArrowRight({ className }: { className?: string }) {
  return <IconLink className={className} />;
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

function StatCard({ label, value, sub, tone = "default" }: { label: string; value: number | string; sub?: string; tone?: "default" | "success" | "warning" | "muted" }) {
  const toneClass = tone === "success" ? "text-emerald-600 bg-emerald-500/10" : tone === "warning" ? "text-amber-600 bg-amber-500/10" : tone === "muted" ? "text-muted-foreground bg-muted/50" : "text-primary bg-primary/10";
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
          <div className="text-2xl font-semibold">{value}</div>
          {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
        </div>
        <div className={`h-8 w-8 rounded-full flex items-center justify-center ${toneClass}`}>
          <IconActivity className="h-4 w-4" />
        </div>
      </div>
    </Card>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="bg-muted p-3 rounded-lg">
      <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={cn("font-mono text-xs", mono ? "break-all" : "")}>{value}</div>
    </div>
  );
}

function InsightCard({ title, value, subtitle, icon, tone = "default" }: { title: string; value: number | string; subtitle: string; icon: React.ReactNode; tone?: "default" | "success" | "warning" | "muted" }) {
  const toneClass = tone === "success" ? "border-emerald-500 text-emerald-600" : tone === "warning" ? "border-amber-500 text-amber-600" : tone === "muted" ? "border-muted text-muted-foreground" : "border-primary text-primary";
  return (
    <Card className={`p-4 border-l-4 ${toneClass}`}>
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">{title}</div>
          <div className="text-2xl font-semibold">{value}</div>
          <div className="text-xs text-muted-foreground">{subtitle}</div>
        </div>
        <div className="h-8 w-8 rounded-md flex items-center justify-center bg-muted/50">
          {icon}
        </div>
      </div>
    </Card>
  );
}
