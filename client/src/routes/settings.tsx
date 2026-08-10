import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Archive,
  Check,
  Copy,
  FolderOpen,
  KeyRound,
  Monitor,
  Moon,
  RefreshCw,
  Sun,
  Trash2,
  Download,
  Upload,
  ServerCog,
  ShieldCheck,
  ShieldX,
  Loader2,
  Database,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
import { FolderPicker } from "@/components/folder-picker";
import { useWorkspaces } from "@/lib/workspace-store";
import { useTheme, type Theme } from "@/lib/theme-provider";
import { cn } from "@/lib/utils";
import {
  api,
  getStoredToken,
  setToken as persistToken,
} from "@/lib/api";
import { WORKSPACE_COLORS, WORKSPACE_ICONS } from "@/lib/constants";
import { getWorkspaceIcon } from "@/lib/icon-map";
import {
  getRefreshIntervalMs,
  setRefreshIntervalMs,
} from "@/lib/utils";
import type { DockerStatus } from "@/lib/types";

const REFRESH_OPTIONS = [
  { label: "2 seconds", value: 2000 },
  { label: "5 seconds", value: 5000 },
  { label: "10 seconds", value: 10000 },
  { label: "30 seconds", value: 30000 },
  { label: "1 minute", value: 60000 },
  { label: "Off (manual only)", value: 0 },
];

interface BackupEntry {
  name: string;
  path: string;
  createdAt: string;
  fileCount: number;
  size: number;
}

export default function SettingsPage() {
  const { current, updateWorkspace, deleteWorkspace, density, setDensity, exportAll, importAll } =
    useWorkspaces();
  const importRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();
  const { theme, setTheme } = useTheme();

  const [name, setName] = useState(current?.name ?? "");
  const [color, setColor] = useState(current?.color ?? WORKSPACE_COLORS[0]);
  const [icon, setIcon] = useState(current?.icon ?? WORKSPACE_ICONS[0]);
  const [folderOpen, setFolderOpen] = useState(false);
  const [tempFolder, setTempFolder] = useState(current?.rootFolder ?? "/home/user");
  const [deleteOpen, setDeleteOpen] = useState(false);

  /* refresh interval (persisted locally + synced to backend settings) */
  const [refreshInterval, setRefreshInterval] = useState<number>(getRefreshIntervalMs());

  useEffect(() => {
    api
      .getSettings()
      .then((s) => {
        const raw = s?.["refreshInterval"];
        if (typeof raw === "number" && raw >= 0) {
          setRefreshInterval(raw);
          setRefreshIntervalMs(raw);
        }
      })
      .catch(() => {});
  }, []);

  const saveRefreshInterval = async (value: number) => {
    setRefreshInterval(value);
    setRefreshIntervalMs(value);
    try {
      await api.updateSettings({ refreshInterval: value });
      toast.success(value === 0 ? "Auto-refresh disabled" : "Auto-refresh interval updated");
    } catch {
      toast.success("Auto-refresh interval updated (local only)");
    }
  };

  /* docker connection */
  const [dockerStatus, setDockerStatus] = useState<DockerStatus | null>(null);
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<boolean | null>(null);

  const testDocker = async () => {
    setPinging(true);
    setPingResult(null);
    try {
      const [status, ping] = await Promise.all([api.dockerStatus(), api.dockerPing()]);
      setDockerStatus(status);
      setPingResult(ping.alive);
      toast.success(ping.alive ? "Docker connection OK" : "Docker not reachable");
    } catch (e: any) {
      toast.error(e.message ?? "Docker connection failed");
      setPingResult(false);
    } finally {
      setPinging(false);
    }
  };

  /* token */
  const [token, setTokenState] = useState(getStoredToken());
  const [copied, setCopied] = useState(false);

  const saveToken = () => {
    const clean = token.trim() || "dev-token";
    persistToken(clean);
    setTokenState(clean);
    toast.success("API token updated");
  };

  /* backups */
  const [backups, setBackups] = useState<BackupEntry[]>([]);
  const [backupsLoading, setBackupsLoading] = useState(false);
  const [backingUp, setBackingUp] = useState(false);
  const [restoreTarget, setRestoreTarget] = useState<BackupEntry | null>(null);
  const [deleteBackupTarget, setDeleteBackupTarget] = useState<BackupEntry | null>(null);
  const [backupBusy, setBackupBusy] = useState(false);

  const loadBackups = async (silent = false) => {
    if (!silent) setBackupsLoading(true);
    try {
      const list = await api.listBackups(current?.id ?? "default");
      setBackups(list as BackupEntry[]);
    } catch (e: any) {
      toast.error(`Failed to load backups: ${e.message}`);
    } finally {
      setBackupsLoading(false);
    }
  };

  useEffect(() => {
    loadBackups(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createBackup = async () => {
    setBackingUp(true);
    try {
      const res = await api.backupWorkspace(current?.id ?? "default");
      toast.success(`Backup created (${res.files} files)`);
      await loadBackups(true);
    } catch (e: any) {
      toast.error(e.message ?? "Backup failed");
    } finally {
      setBackingUp(false);
    }
  };

  const doRestore = async () => {
    if (!restoreTarget) return;
    setBackupBusy(true);
    try {
      await api.restoreBackup(current?.id ?? "default", restoreTarget.name);
      toast.success(`Restored from ${restoreTarget.name}`);
      setRestoreTarget(null);
      await loadBackups(true);
    } catch (e: any) {
      toast.error(e.message ?? "Restore failed");
    } finally {
      setBackupBusy(false);
    }
  };

  const doDeleteBackup = async () => {
    if (!deleteBackupTarget) return;
    setBackupBusy(true);
    try {
      await api.deleteBackup(current?.id ?? "default", deleteBackupTarget.name);
      toast.success(`Deleted ${deleteBackupTarget.name}`);
      setDeleteBackupTarget(null);
      await loadBackups(true);
    } catch (e: any) {
      toast.error(e.message ?? "Delete failed");
    } finally {
      setBackupBusy(false);
    }
  };

  if (!current) return null;

  const save = async () => {
    try {
      await api.updateWorkspace(current.id, { name: name.trim() || current.name, color, icon });
      updateWorkspace(current.id, { name: name.trim() || current.name, color, icon });
      toast.success("Workspace updated");
    } catch (e: any) {
      toast.error(e.message ?? "Failed to update workspace");
    }
  };

  const formatBytes = (b: number) => {
    if (b >= 1073741824) return `${(b / 1073741824).toFixed(1)} GB`;
    if (b >= 1048576) return `${(b / 1048576).toFixed(1)} MB`;
    if (b >= 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${b} B`;
  };

  const copyToken = async () => {
    try {
      await navigator.clipboard.writeText(token);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground">
          Configure workspace, appearance, Docker connection, backups, and integrations.
        </p>
      </div>

      <Tabs defaultValue="workspace">
        <TabsList className="flex flex-wrap rounded-md">
          <TabsTrigger value="workspace" className="rounded-md">Workspace</TabsTrigger>
          <TabsTrigger value="appearance" className="rounded-md">Appearance</TabsTrigger>
          <TabsTrigger value="docker" className="rounded-md">Docker</TabsTrigger>
          <TabsTrigger value="backups" className="rounded-md">Backups</TabsTrigger>
          <TabsTrigger value="advanced" className="rounded-md">Advanced</TabsTrigger>
        </TabsList>

        <TabsContent value="workspace" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">General</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div>
                <Label>Name</Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label>Root folder</Label>
                <div className="mt-1.5 flex gap-2">
                  <Input value={current.rootFolder} readOnly className="text-mono" />
                  <Button
                    variant="outline"
                    onClick={() => {
                      setTempFolder(current.rootFolder);
                      setFolderOpen(true);
                    }}
                  >
                    <FolderOpen className="mr-2 h-4 w-4" /> Change
                  </Button>
                </div>
              </div>
              <div>
                <Label>Color</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {WORKSPACE_COLORS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setColor(c)}
                      className={cn(
                        "h-8 w-8 rounded-lg border-2",
                        color === c ? "border-foreground scale-110" : "border-transparent",
                      )}
                      style={{ backgroundColor: c }}
                    />
                  ))}
                </div>
              </div>
              <div>
                <Label>Icon</Label>
                <div className="mt-1.5 flex flex-wrap gap-2">
                  {WORKSPACE_ICONS.map((i) => {
                    const I = getWorkspaceIcon(i);
                    return (
                      <button
                        key={i}
                        type="button"
                        onClick={() => setIcon(i)}
                        className={cn(
                          "grid h-9 w-9 place-items-center rounded-lg border-2",
                          icon === i
                            ? "border-primary bg-primary/10 text-primary"
                            : "border-border text-muted-foreground",
                        )}
                      >
                        <I className="h-4 w-4" />
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <Button onClick={save}>Save changes</Button>
              </div>
            </CardContent>
          </Card>

          <Card className="border-destructive/40">
            <CardHeader>
              <CardTitle className="text-base text-destructive">Danger zone</CardTitle>
            </CardHeader>
            <CardContent className="flex items-center justify-between gap-3">
              <div>
                <div className="text-sm font-medium">Delete this workspace</div>
                <div className="text-xs text-muted-foreground">
                  Removes all stacks and settings in {current.name}. Cannot be undone.
                </div>
              </div>
              <Button variant="destructive" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" /> Delete
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="appearance" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Theme</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-3">
                {(
                  [
                    { id: "light", label: "Light", Icon: Sun, preview: "from-white to-slate-100" },
                    { id: "dark", label: "Dark", Icon: Moon, preview: "from-slate-900 to-slate-800" },
                    { id: "system", label: "System", Icon: Monitor, preview: "from-slate-100 to-slate-900" },
                  ] as { id: Theme; label: string; Icon: typeof Sun; preview: string }[]
                ).map(({ id, label, Icon, preview }) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTheme(id)}
                    className={cn(
                      "group flex flex-col overflow-hidden rounded-xl border-2 text-left transition-all",
                      theme === id
                        ? "border-primary shadow-sm"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    <div className={cn("h-20 bg-gradient-to-br", preview)} />
                    <div className="flex items-center justify-between p-3">
                      <div className="flex items-center gap-2">
                        <Icon className="h-4 w-4" />
                        <span className="text-sm font-medium">{label}</span>
                      </div>
                      {theme === id && <Check className="h-4 w-4 text-primary" />}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="docker" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Docker connection</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-3">
                <Button onClick={testDocker} disabled={pinging}>
                  {pinging ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <ServerCog className="mr-2 h-4 w-4" />
                  )}
                  Test & refresh status
                </Button>
                {pingResult === true && (
                  <Badge variant="secondary" className="gap-1 border-emerald-500/30 text-emerald-600 dark:text-emerald-400">
                    <ShieldCheck className="h-3 w-3" /> Connected
                  </Badge>
                )}
                {pingResult === false && (
                  <Badge variant="secondary" className="gap-1 border-red-500/30 text-red-600 dark:text-red-400">
                    <ShieldX className="h-3 w-3" /> Not reachable
                  </Badge>
                )}
                {dockerStatus?.running && (
                  <span className="font-mono text-xs text-muted-foreground">
                    Docker Engine v{dockerStatus.version}
                  </span>
                )}
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Engine</div>
                  <div className={cn("mt-1 flex items-center gap-2 font-medium", dockerStatus?.running ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400")}>
                    <span className={cn("h-2 w-2 rounded-full", dockerStatus?.running ? "bg-emerald-500" : "bg-red-500")} />
                    {dockerStatus?.running ? "Running" : "Not running"}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Containers</div>
                  <div className="mt-1 text-sm font-medium">
                    {dockerStatus ? `${dockerStatus.runningContainers} running / ${dockerStatus.containers} total` : "—"}
                  </div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Images</div>
                  <div className="mt-1 text-sm font-medium">{dockerStatus?.images ?? "—"}</div>
                </div>
                <div className="rounded-md border p-3">
                  <div className="text-xs text-muted-foreground">Platform</div>
                  <div className="mt-1 truncate text-sm font-medium">{dockerStatus?.os ?? "—"}</div>
                  <div className="font-mono text-[10px] text-muted-foreground">
                    {dockerStatus?.architecture}
                  </div>
                </div>
              </div>

              <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">Socket</span>
                  <code className="truncate rounded bg-background px-2 py-0.5 font-mono text-xs">
                    /var/run/docker.sock
                  </code>
                </div>
                <div className="flex items-center gap-2">
                  <span className="w-28 shrink-0 font-mono text-xs text-muted-foreground">Server version</span>
                  <code className="rounded bg-background px-2 py-0.5 font-mono text-xs">
                    {dockerStatus?.version ?? "—"}
                  </code>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="backups" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-base">Workspace file backups</CardTitle>
                <Button size="sm" onClick={createBackup} disabled={backingUp}>
                  <Archive className="mr-2 h-4 w-4" />
                  {backingUp ? "Creating…" : "Create backup"}
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {backupsLoading ? (
                <div className="flex items-center justify-center py-10 text-sm text-muted-foreground">
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" /> Loading backups…
                </div>
              ) : backups.length === 0 ? (
                <div className="grid place-items-center gap-2 rounded-md border border-dashed py-10 text-center">
                  <Database className="h-6 w-6 text-muted-foreground/40" />
                  <p className="text-sm text-muted-foreground">No backups yet.</p>
                  <p className="text-xs text-muted-foreground/70">
                    Create a backup to snapshot your workspace YAML files.
                  </p>
                </div>
              ) : (
                <div className="divide-y rounded-md border">
                  {backups.map((b) => (
                    <div key={b.name} className="flex flex-wrap items-center gap-3 p-3">
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-mono text-sm">{b.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(b.createdAt).toLocaleString()} · {b.fileCount} files ·{" "}
                          {formatBytes(b.size)}
                        </div>
                      </div>
                      <div className="flex gap-1.5">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setRestoreTarget(b)}
                          disabled={backupBusy}
                        >
                          <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> Restore
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="text-destructive hover:text-destructive"
                          onClick={() => setDeleteBackupTarget(b)}
                          disabled={backupBusy}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="advanced" className="space-y-4 pt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Auto-refresh interval</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="mb-3 text-xs text-muted-foreground">
                Controls how often pages like Containers re-poll the Docker daemon.
              </p>
              <div className="flex flex-wrap gap-2">
                {REFRESH_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => saveRefreshInterval(opt.value)}
                    className={cn(
                      "rounded-md border-2 px-3 py-1.5 text-sm transition-colors",
                      refreshInterval === opt.value
                        ? "border-primary bg-primary/5 text-primary"
                        : "border-border hover:border-foreground/30",
                    )}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Density</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-3 sm:grid-cols-2">
                {(["comfortable", "compact"] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setDensity(d);
                      toast.success(`${d} density enabled`);
                    }}
                    className={cn(
                      "flex items-center justify-between rounded-md border-2 p-4 text-left transition-colors",
                      density === d ? "border-primary bg-primary/5" : "border-border hover:border-foreground/30",
                    )}
                  >
                    <div>
                      <div className="font-mono text-sm font-medium capitalize">{d}</div>
                      <div className="text-xs text-muted-foreground">
                        {d === "compact" ? "Tighter rows, smaller paddings" : "Roomy layout, easier scanning"}
                      </div>
                    </div>
                    {density === d && <Check className="h-4 w-4 text-primary" />}
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">API token</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <KeyRound className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    value={token}
                    onChange={(e) => setTokenState(e.target.value)}
                    placeholder="dev-token"
                    className="pl-8 font-mono"
                  />
                </div>
                <Button variant="outline" onClick={copyToken} title="Copy token">
                  {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                </Button>
                <Button onClick={saveToken}>Save</Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Token is sent as a <span className="font-mono">Bearer</span> header on every API
                request. Changes apply immediately.
              </p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Backup & restore (browser data)</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap gap-2">
              <Button
                variant="outline"
                className="rounded-md"
                onClick={() => {
                  const blob = new Blob([exportAll()], { type: "application/json" });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `dockermanager-backup-${Date.now()}.json`;
                  a.click();
                  URL.revokeObjectURL(url);
                  toast.success("Backup exported");
                }}
              >
                <Download className="mr-2 h-4 w-4" /> Export workspaces
              </Button>
              <input
                ref={importRef}
                type="file"
                accept="application/json"
                hidden
                onChange={async (e) => {
                  const f = e.target.files?.[0];
                  if (!f) return;
                  const text = await f.text();
                  const ok = importAll(text);
                  if (ok) toast.success("Import complete");
                  else toast.error("Invalid backup file");
                  e.target.value = "";
                }}
              />
              <Button
                variant="outline"
                className="rounded-md"
                onClick={() => importRef.current?.click()}
              >
                <Upload className="mr-2 h-4 w-4" /> Import backup
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={folderOpen} onOpenChange={setFolderOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Change root folder</DialogTitle>
          </DialogHeader>
          <FolderPicker value={tempFolder} onChange={setTempFolder} />
          <DialogFooter>
            <Button variant="ghost" onClick={() => setFolderOpen(false)}>
              Cancel
            </Button>
            <Button
              onClick={async () => {
                try {
                  await api.updateWorkspace(current.id, { rootFolderPath: tempFolder });
                  updateWorkspace(current.id, { rootFolderPath: tempFolder });
                  setFolderOpen(false);
                  toast.success("Root folder updated");
                } catch (e: any) {
                  toast.error(e.message ?? "Failed to update root folder");
                }
              }}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {current.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes all stacks, YAML references, and chat history for this workspace.
              This action can't be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                const id = current.id;
                try {
                  await api.deleteWorkspace(id);
                  deleteWorkspace(id);
                  setDeleteOpen(false);
                  toast.success("Workspace deleted");
                  navigate("/");
                } catch (e: any) {
                  toast.error(e.message ?? "Failed to delete workspace");
                }
              }}
            >
              Delete workspace
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* restore confirm */}
      <AlertDialog open={!!restoreTarget} onOpenChange={(o) => !o && setRestoreTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restore {restoreTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This copies all files from the snapshot back into your workspace root. Existing files
              with the same names will be overwritten.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={backupBusy}
              onClick={doRestore}
            >
              {backupBusy ? "Restoring…" : "Restore backup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* delete backup confirm */}
      <AlertDialog
        open={!!deleteBackupTarget}
        onOpenChange={(o) => !o && setDeleteBackupTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteBackupTarget?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              The snapshot will be permanently removed from the backup directory.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={backupBusy}
              onClick={doDeleteBackup}
            >
              {backupBusy ? "Deleting…" : "Delete backup"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}