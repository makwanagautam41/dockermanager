import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  IconBrandDocker,
  IconCpu,
  IconDeviceDesktop,
  IconDeviceFloppy,
  IconFolder,
  IconInfoCircle,
  IconPhoto,
  IconPlus,
  IconRefresh,
  IconServer,
  IconStack2,
  IconWeight,
} from "@tabler/icons-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { api } from "@/lib/api";
import type { DockerStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useWorkspaces } from "@/lib/workspace-store";

const QUICK_LINKS = [
  {
    title: "Run a compose stack",
    description: "Paste any docker-compose YAML and spin it up in one click.",
    to: "/containers",
    Icon: IconStack2,
  },
  {
    title: "Pull images from Docker Hub",
    description: "Search the registry, copy pull commands, and pull with live progress.",
    to: "/registry",
    Icon: IconPhoto,
  },
  {
    title: "Browse compose files",
    description: "Edit YAML files in your workspace folder with live preview.",
    to: "/yaml",
    Icon: IconFolder,
  },
  {
    title: "Set up container filters",
    description: "Categorize and filter your running containers by type, status, and network.",
    to: "/containers",
    Icon: IconInfoCircle,
  },
];

function formatMemory(bytes?: number): string {
  if (!bytes) return "—";
  if (bytes >= 1099511627776) return `${(bytes / 1099511627776).toFixed(2)} TB`;
  if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
  if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
  return `${bytes} B`;
}

export default function SetupPage() {
  const { current } = useWorkspaces();
  const navigate = useNavigate();
  const [status, setStatus] = useState<DockerStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [pinging, setPinging] = useState(false);
  const [pingOk, setPingOk] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchStatus = async (silent = false) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const s = await api.dockerStatus();
      setStatus(s);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const testPing = async () => {
    setPinging(true);
    setPingOk(null);
    try {
      const res = await api.dockerPing();
      setPingOk(res.alive);
      if (res.alive) await fetchStatus(true);
    } catch {
      setPingOk(false);
    } finally {
      setPinging(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const t = setInterval(() => {
      if (!document.hidden) fetchStatus(true);
    }, 20000);
    return () => clearInterval(t);
  }, []);

  const statCards = [
    {
      label: "Docker Engine",
      value: loading ? "Checking…" : status?.running ? "Running" : "Not running",
      sub: status?.version ? `v${status.version}` : undefined,
      dot: status?.running === true ? "bg-emerald-500 animate-pulse" : status?.running === false ? "bg-red-500" : "bg-slate-400",
      Icon: IconBrandDocker,
    },
    {
      label: "Containers",
      value: status?.containers ?? "—",
      sub: `${status?.runningContainers ?? 0} running · ${status?.stoppedContainers ?? 0} stopped`,
      Icon: IconServer,
    },
    {
      label: "Images",
      value: status?.images ?? "—",
      Icon: IconPhoto,
    },
    {
      label: "Platform",
      value: status?.os ?? "—",
      sub: status?.architecture ?? "",
      Icon: IconDeviceDesktop,
    },
  ];

  const facts = [
    { label: "Hostname", value: status?.hostname, mono: true },
    { label: "Docker root dir", value: status?.dockerRootDir, mono: true },
    { label: "Storage driver", value: status?.storageDriver, mono: true },
    { label: "Kernel", value: status?.kernel, mono: true },
    { label: "API version", value: status?.apiVersion, mono: true },
    { label: "CPU count", value: status?.cpus ? `${status.cpus} cores` : undefined, mono: false },
    { label: "Total memory", value: formatMemory(status?.totalMemory), mono: false },
    { label: "OS type", value: status?.ostype, mono: true },
  ].filter((f) => f.value);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">Setup</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Docker engine status, environment details, and quick-start actions.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={testPing} disabled={pinging}>
          <IconRefresh className={cn("mr-2 h-4 w-4", pinging && "animate-spin")} stroke={1.75} />
          Test connection
        </Button>
      </div>

      {pingOk !== null && (
        <div
          className={cn(
            "rounded-md border px-3 py-2.5 text-sm",
            pingOk
              ? "border-emerald-500/40 bg-emerald-500/5 text-emerald-700 dark:text-emerald-400"
              : "border-red-500/40 bg-red-500/5 text-red-700 dark:text-red-400",
          )}
        >
          {pingOk ? "Docker daemon is reachable and responding to ping." : "Docker daemon did not respond to ping."}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {statCards.map((card) => (
          <Card key={card.label} className="p-5">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              {card.dot ? (
                <span className={cn("inline-block h-2 w-2 rounded-full", card.dot)} />
              ) : (
                <card.Icon className="h-4 w-4" stroke={1.75} />
              )}
              {card.label}
            </div>
            <div className="mt-2 flex items-center gap-2 truncate text-lg font-semibold">
              {card.value}
            </div>
            {card.sub && (
              <div className="mt-1 truncate font-mono text-xs text-muted-foreground">
                {card.sub}
              </div>
            )}
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-sm font-medium">
            <IconBrandDocker className="h-4 w-4 text-primary" stroke={1.75} />
            Connection Details
          </div>
          <div className="space-y-2">
            {facts.map((f) => (
              <div key={f.label} className="flex items-center gap-2 text-sm">
                <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">
                  {f.label}
                </span>
                <code className="truncate rounded bg-muted px-2 py-0.5 font-mono text-xs">
                  {f.value}
                </code>
              </div>
            ))}
            <div className="flex items-center gap-2 text-sm">
              <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">Socket</span>
              <code className="rounded bg-muted px-2 py-0.5 font-mono text-xs">
                {status?.running ? "/var/run/docker.sock" : "Not connected"}
              </code>
            </div>
            {error && (
              <div className="rounded-md bg-destructive/10 p-3 text-xs text-destructive">
                Error: {error}
              </div>
            )}
          </div>
        </Card>

        <Card className="p-5">
          <div className="mb-3 flex items-center gap-2 font-mono text-sm font-medium">
            <IconCpu className="h-4 w-4 text-primary" stroke={1.75} />
            Runtime Resources
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconCpu className="h-3.5 w-3.5" stroke={1.75} /> CPU
              </div>
              <div className="mt-1 text-base font-semibold">
                {status?.cpus ? `${status.cpus} cores` : "—"}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconWeight className="h-3.5 w-3.5" stroke={1.75} /> Memory
              </div>
              <div className="mt-1 text-base font-semibold">
                {formatMemory(status?.totalMemory)}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconDeviceFloppy className="h-3.5 w-3.5" stroke={1.75} /> Storage driver
              </div>
              <div className="mt-1 truncate text-base font-semibold">
                {status?.storageDriver ?? "—"}
              </div>
            </div>
            <div className="rounded-md border p-3">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <IconFolder className="h-3.5 w-3.5" stroke={1.75} /> Workspace root
              </div>
              <div className="mt-1 truncate font-mono text-xs leading-5">
                {current?.rootFolder ?? "docker-yaml-files"}
              </div>
            </div>
          </div>

          <Separator className="my-4" />

          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary" className="gap-1">
              <IconBrandDocker className="h-3 w-3" stroke={1.75} />
              {status?.running ? "Engine online" : "Engine offline"}
            </Badge>
            {pingOk === true && (
              <Badge variant="secondary" className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                <IconRefresh className="h-3 w-3" stroke={2} /> Ping OK
              </Badge>
            )}
          </div>
        </Card>
      </div>

      <div>
        <h2 className="mb-3 text-base font-semibold">Quick start</h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {QUICK_LINKS.map((link) => (
            <Card
              key={link.to}
              className="group cursor-pointer p-4 transition-colors hover:border-primary/50"
              onClick={() => navigate(link.to)}
            >
              <link.Icon className="h-5 w-5 text-muted-foreground group-hover:text-primary" stroke={1.75} />
              <div className="mt-2 text-sm font-semibold">{link.title}</div>
              <p className="mt-1 text-xs text-muted-foreground">{link.description}</p>
              <Button
                variant="ghost"
                size="sm"
                className="mt-3 h-7 gap-1 px-2 text-xs text-muted-foreground group-hover:text-primary"
              >
                <IconPlus className="h-3 w-3" stroke={2} /> Open
              </Button>
            </Card>
          ))}
        </div>
      </div>
    </div>
  );
}