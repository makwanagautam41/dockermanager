import { useCallback, useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';
import {
  IconArchive,
  IconChevronDown,
  IconChevronRight,
  IconCopy,
  IconDots,
  IconDownload,
  IconEye,
  IconEyeOff,
  IconFile,
  IconFolder,
  IconFolderOpen,
  IconFolderPlus,
  IconKey,
  IconPencil,
  IconPlus,
  IconRefresh,
  IconPlayerPlay,
  IconRestore,
  IconTrash,
  IconUpload,
  IconX,
  IconTerminal,
  IconCheck,
} from '@tabler/icons-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { YamlEditor } from '@/components/yaml-editor';
import { PageSkeleton } from '@/components/page-skeleton';
import { EmptyState } from '@/components/empty-state';
import { FolderTerminalDialog } from '@/components/folder-terminal';
import { PageHelpPopover } from '@/components/page-help-popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useWorkspaces } from '@/lib/workspace-store';
import { api } from '@/lib/api';
import type { EnvVar, YamlFile } from '@/lib/types';
import { cn } from '@/lib/utils';
import * as yaml from 'js-yaml';

async function copyForExplorer(text: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {}
  }

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('readonly', '');
  textarea.style.position = 'fixed';
  textarea.style.opacity = '0';
  document.body.appendChild(textarea);
  const activeElement = document.activeElement as HTMLElement | null;
  textarea.select();
  const copied = document.execCommand('copy');
  document.body.removeChild(textarea);
  activeElement?.focus();
  if (!copied) throw new Error('Clipboard copy is not available');
}

type DirHandle = {
  name: string;
  getFileHandle: (
    name: string,
    opts?: { create?: boolean },
  ) => Promise<{
    createWritable: () => Promise<{
      write: (d: string) => Promise<void>;
      close: () => Promise<void>;
    }>;
  }>;
};

export default function YamlPage() {
  const {
    current,
    treeByWs,
    updateYamlFile,
    updateYamlEnv,
    renameYamlNode,
    deleteYamlNode,
    duplicateYamlNode,
    createYamlChild,
    pushActivity,
    hydrated,
    refresh,
    ensureTree,
  } = useWorkspaces();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [renameFor, setRenameFor] = useState<YamlFile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [deleteFor, setDeleteFor] = useState<YamlFile | null>(null);
  const [createFor, setCreateFor] = useState<{
    parent: YamlFile;
    isDir: boolean;
  } | null>(null);
  const [createValue, setCreateValue] = useState('');
  const [backups, setBackups] = useState<any[]>([]);
  const [loadingBackups, setLoadingBackups] = useState(false);
  const [terminalOpen, setTerminalOpen] = useState(false);
  const backupsLoadedWsRef = useRef<string | null>(null);
  const [spinYaml, setSpinYaml] = useState<YamlFile | null>(null);
  const [spinModify, setSpinModify] = useState<'ask' | 'modify' | 'direct'>(
    'ask',
  );
  const [spinModifiedContent, setSpinModifiedContent] = useState('');

  const fetchBackups = useCallback(async (wsId: string, force = false) => {
    if (!wsId) return;
    if (!force && backupsLoadedWsRef.current === wsId) return;
    setLoadingBackups(true);
    try {
      const data = await api.listBackups(wsId);
      setBackups(data);
      backupsLoadedWsRef.current = wsId;
    } catch {
      // ignore
    } finally {
      setLoadingBackups(false);
    }
  }, []);

  const lastFetchedWsId = useRef<string | null>(null);
  useEffect(() => {
    if (current?.id && current.id !== lastFetchedWsId.current) {
      lastFetchedWsId.current = current.id;
      ensureTree(current.id);
      // NOTE: Backups are lazy-loaded on demand when the backups tab is activated
    }
  }, [current?.id, ensureTree]);

  if (!hydrated) return <PageSkeleton variant="editor" />;
  if (!current) return null;
  const tree = treeByWs[current.id];
  if (tree === undefined) return <PageSkeleton variant="editor" />;
  if (!tree) {
    return (
      <EmptyState
        icon={IconFolderOpen}
        title="Workspace folder is unavailable"
        description={`The configured root folder does not exist or cannot be read: ${current.rootFolder || '(not configured)'}`}
      />
    );
  }

  const findFile = (node: YamlFile): YamlFile | null => {
    if (node.id === selectedId) return node;
    for (const c of node.children ?? []) {
      const f = findFile(c);
      if (f) return f;
    }
    return null;
  };
  const selected = selectedId ? findFile(tree) : null;

  // On-demand lazy load for file content if omitted from tree preview
  useEffect(() => {
    if (selected && !selected.isDir) {
      if (
        selected.content === '' ||
        selected.content === 'File too large for tree preview (click to view)'
      ) {
        api
          .readFile(selected.path)
          .then((res) => {
            if (res?.content !== undefined) {
              selected.content = res.content;
              setSelectedId((prev) => (prev ? `${prev}` : prev));
            }
          })
          .catch(() => {});
      }
    }
  }, [selected?.id, selected?.path]);

  const doImport = async () => {
    toast.error('Import feature has been removed from the explorer');
  };

  const doExport = () => {
    if (!selected || selected.isDir) return;
    const blob = new Blob([selected.content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = selected.name;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${selected.name}`);
  };

  const doBackup = async () => {
    if (!selected || selected.isDir || !current) return;
    try {
      await api.backupWorkspace(current.id);
      setBackups(await api.listBackups(current.id));
      pushActivity(current.id, {
        kind: 'edit',
        message: `backup: ${selected.name}`,
      });
      toast.success('Backup created');
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  const doRestore = async (snapshotName: string) => {
    if (!current) return;
    try {
      await api.restoreBackup(current.id, snapshotName);
      toast.success('Backup restored');
      fetchBackups(current.id, true);
      refresh();
    } catch (e: any) {
      toast.error(e.message);
    }
  };

  // Execute docker compose up for a selected yaml file
  const doComposeUp = async () => {
    if (!selected || selected.isDir || !current) return;
    try {
      await api.composeUpFromYaml(
        `${current.rootFolder}/${selected.name}`,
        selected.content,
        current.id,
        selected.name.replace(/\.(yml|yaml)$/, ''),
      );
      toast.success(`Container started from ${selected.name}`);
      refresh();
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to start container');
    }
  };

  // Execute docker compose down for a selected yaml file
  const doComposeDown = async () => {
    if (!selected || selected.isDir || !current) return;
    try {
      // Use the compose down API - we need to figure out the workspace/project
      toast.info('Compose down functionality coming soon');
    } catch (e: any) {
      toast.error(e.message ?? 'Failed to stop container');
    }
  };

  const terminalCwd = selected
    ? selected.isDir
      ? selected.path || `${current.rootFolder}/${selected.name}`
      : selected.path
        ? selected.path.substring(0, selected.path.lastIndexOf('/')) || current.rootFolder
        : current.rootFolder
    : current?.rootFolder || 'docker-yaml-files';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold tracking-tight md:text-3xl">
            File Explorer
          </h1>
          <PageHelpPopover
            title="File Explorer & Compose"
            description="Inspect, edit, and spin Docker Compose YAML stacks and .env configuration files directly on the host file system."
            tips={[
              "Click any YAML file to view, edit, or live-validate syntax",
              "Click 'Terminal' to launch an interactive shell in that stack directory",
              "Edit environment variables with the dedicated .env tab",
              "Use 'Spin' to launch the compose stack in one click",
            ]}
            dockerCommands={[
              "docker compose up -d",
              "docker compose down",
              "docker compose ps",
              "docker compose logs",
              "docker compose config",
            ]}
          />
        </div>
        <div className="flex items-center gap-2">
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={async () => {
              if (current?.id) {
                const toastId = toast.loading('Refreshing Explorer…');
                try {
                  await ensureTree(current.id, true);
                  toast.success('Explorer refreshed', { id: toastId });
                } catch (err: any) {
                  toast.error(err?.message || 'Failed to refresh', { id: toastId });
                }
              }
            }}
          >
            <IconRefresh className="h-3.5 w-3.5" stroke={1.75} /> Refresh
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={() => setTerminalOpen(true)}
            title="Open terminal in current stack folder"
          >
            <IconTerminal className="h-3.5 w-3.5" stroke={1.75} /> Terminal
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={doExport}
          >
            <IconDownload className="h-3.5 w-3.5" stroke={1.75} /> Export
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-8 gap-1.5"
            onClick={doBackup}
          >
            <IconArchive className="h-3.5 w-3.5" stroke={1.75} /> Backup
          </Button>
          {/* Docker compose buttons */}
          {selected &&
            !selected.isDir &&
            (selected.name.endsWith('.yml') ||
              selected.name.endsWith('.yaml')) && (
              <>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-emerald-500 hover:text-emerald-600"
                  onClick={doComposeUp}
                >
                  <IconPlayerPlay className="h-3.5 w-3.5" stroke={1.75} /> Spin
                  up
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-8 gap-1.5 text-red-500 hover:text-red-600"
                  onClick={doComposeDown}
                >
                  <IconX className="h-3.5 w-3.5" stroke={1.75} /> Spin down
                </Button>
              </>
            )}
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="lg:col-span-4 xl:col-span-3 flex flex-col h-[calc(100vh-12rem)] min-h-[500px] overflow-hidden">
          <div className="flex items-center justify-between border-b px-2 py-1.5 shrink-0 bg-muted/20">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
              files
            </span>
            <div className="flex gap-1">
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="New file at root"
                onClick={() => {
                  setCreateFor({ parent: tree, isDir: false });
                  setCreateValue('new-file.yml');
                }}
              >
                <IconFile className="h-3.5 w-3.5" stroke={1.75} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="New folder at root"
                onClick={() => {
                  setCreateFor({ parent: tree, isDir: true });
                  setCreateValue('new-folder');
                }}
              >
                <IconFolderPlus className="h-3.5 w-3.5" stroke={1.75} />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6"
                title="New .env at root"
                onClick={() => {
                  setCreateFor({ parent: tree, isDir: false });
                  setCreateValue('.env');
                }}
              >
                <IconKey className="h-3.5 w-3.5" stroke={1.75} />
              </Button>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overscroll-contain p-2">
            <FileTree
              node={tree}
              level={0}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onAction={(node, action) => {
                if (action === 'delete') setDeleteFor(node);
                if (action === 'duplicate') {
                  const toastId = toast.loading(`Duplicating ${node.name}…`);
                  duplicateYamlNode(current.id, node.id)
                    .then((id) => {
                      if (id) setSelectedId(id);
                      toast.success(`Duplicated ${node.name}`, { id: toastId });
                    })
                    .catch((err: any) => {
                      toast.error(err?.message || 'Failed to duplicate', { id: toastId });
                    });
                }
                if (action === 'rename') {
                  setRenameFor(node);
                  setRenameValue(node.name);
                }
                if (action === 'new-file') {
                  setCreateFor({ parent: node, isDir: false });
                  setCreateValue('new-file.yml');
                }
                if (action === 'new-folder') {
                  setCreateFor({ parent: node, isDir: true });
                  setCreateValue('new-folder');
                }
                if (action === 'new-env') {
                  setCreateFor({ parent: node, isDir: false });
                  setCreateValue('.env');
                }
              }}
            />
          </div>
        </Card>

        <div className="lg:col-span-8 xl:col-span-9 flex flex-col h-[calc(100vh-12rem)] min-h-[500px] overflow-hidden">
          {selected && !selected.isDir ? (
            <Tabs
              defaultValue="content"
              className="flex flex-col h-full gap-3"
              onValueChange={(val) => {
                if (val === 'backups' && current?.id) {
                  fetchBackups(current.id);
                }
              }}
            >
              <div className="flex items-center justify-between gap-2 shrink-0 border-b pb-2">
                <TabsList className="w-fit">
                  <TabsTrigger
                    value="content"
                    className="gap-1.5 font-mono text-xs"
                  >
                    <IconFile className="h-3.5 w-3.5" stroke={1.75} />{' '}
                    {selected.name}
                  </TabsTrigger>
                  <TabsTrigger value="env" className="gap-1.5 font-mono text-xs">
                    <IconKey className="h-3.5 w-3.5" stroke={1.75} /> .env
                    <Badge
                      variant="secondary"
                      className="ml-1 h-4 px-1 text-[10px]"
                    >
                      {selected.env?.length ?? 0}
                    </Badge>
                  </TabsTrigger>
                  <TabsTrigger
                    value="backups"
                    className="gap-1.5 font-mono text-xs"
                  >
                    <IconArchive className="h-3.5 w-3.5" stroke={1.75} /> backups
                  </TabsTrigger>
                </TabsList>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs gap-1.5"
                  onClick={() => setTerminalOpen(true)}
                  title="Open terminal in this file's folder"
                >
                  <IconTerminal className="h-3.5 w-3.5" />
                  Terminal
                </Button>
              </div>
              <TabsContent value="content" className="mt-0 flex-1 overflow-y-auto overscroll-contain">
                <YamlEditor
                  value={selected.content}
                  filename={selected.name}
                  onSave={(v) => updateYamlFile(current.id, selected.id, v)}
                  onCopy={copyForExplorer}
                />
              </TabsContent>
              <TabsContent value="env" className="mt-0 flex-1 overflow-y-auto overscroll-contain">
                <EnvEditor
                  file={selected}
                  onChange={(env) =>
                    updateYamlEnv(current.id, selected.id, env)
                  }
                />
              </TabsContent>
              <TabsContent value="backups" className="mt-0 flex-1 overflow-y-auto overscroll-contain">
                <BackupsList
                  backups={backups}
                  loading={loadingBackups}
                  onRefresh={() => current && fetchBackups(current.id, true)}
                  onRestore={doRestore}
                />
              </TabsContent>
            </Tabs>
          ) : (
            <Card className="grid h-[420px] place-items-center">
              <div className="text-center">
                <IconFile
                  className="mx-auto mb-2 h-6 w-6 text-muted-foreground"
                  stroke={1.75}
                />
                <div className="text-sm font-medium">Select a file</div>
                <div className="text-xs text-muted-foreground">
                  Pick a file from the tree to view, edit, or manage.
                </div>
              </div>
            </Card>
          )}
        </div>
      </div>

      <RenameDialog
        node={renameFor}
        value={renameValue}
        onValue={setRenameValue}
        onClose={() => setRenameFor(null)}
        onConfirm={() => {
          if (renameFor && renameValue.trim()) {
            const targetNode = renameFor;
            const trimmed = renameValue.trim();
            // Instantly dismiss dialog to avoid blocking UI
            setRenameFor(null);
            setRenameValue('');
            const toastId = toast.loading(`Renaming to "${trimmed}"…`);
            renameYamlNode(current.id, targetNode.id, trimmed)
              .then(() => {
                toast.success(`Renamed to ${trimmed}`, { id: toastId });
              })
              .catch((err: any) => {
                toast.error(err?.message || 'Failed to rename', { id: toastId });
              });
          }
        }}
      />
      <DeleteDialog
        node={deleteFor}
        onClose={() => setDeleteFor(null)}
        onConfirm={() => {
          if (deleteFor) {
            const targetNode = deleteFor;
            // Instantly dismiss dialog to avoid blocking UI
            setDeleteFor(null);
            if (selectedId === targetNode.id) setSelectedId(null);
            const toastId = toast.loading(`Deleting "${targetNode.name}"…`);
            deleteYamlNode(current.id, targetNode.id)
              .then(() => {
                toast.success(`Deleted ${targetNode.name}`, { id: toastId });
              })
              .catch((err: any) => {
                toast.error(err?.message || 'Failed to delete', { id: toastId });
              });
          }
        }}
      />
      <CreateDialog
        state={createFor}
        value={createValue}
        onValue={setCreateValue}
        onClose={() => setCreateFor(null)}
        onConfirm={() => {
          if (createFor && createValue.trim()) {
            const targetParent = createFor.parent;
            const isDir = createFor.isDir;
            const trimmed = createValue.trim();
            // Instantly dismiss dialog to avoid blocking UI
            setCreateFor(null);
            setCreateValue('');
            const toastId = toast.loading(
              `Creating ${isDir ? 'folder' : 'file'} "${trimmed}"…`,
            );
            createYamlChild(current.id, targetParent.id, trimmed, isDir)
              .then((id) => {
                if (id && !isDir) setSelectedId(id);
                toast.success(`Created ${trimmed}`, { id: toastId });
              })
              .catch((err: any) => {
                toast.error(err?.message || 'Failed to create', { id: toastId });
              });
          }
        }}
      />

      <Dialog
        open={!!spinYaml}
        onOpenChange={(o) => {
          if (!o) {
            setSpinYaml(null);
            setSpinModify('ask');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">
              Spin container from {spinYaml?.name}
            </DialogTitle>
            <DialogDescription>
              This will run docker compose up with this YAML file.
            </DialogDescription>
          </DialogHeader>
          {spinModify === 'ask' ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Would you like to modify the YAML before spinning the container?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSpinModifiedContent(spinYaml?.content || '');
                    setSpinModify('modify');
                  }}
                >
                  Yes, modify it
                </Button>
                <Button
                  onClick={async () => {
                    setSpinModify('direct');
                    if (!spinYaml || !current) return;
                    try {
                      await api.composeUpFromYaml(
                        spinYaml.path,
                        spinYaml.content,
                        current.id,
                      );
                      toast.success('Container spun from ' + spinYaml.name);
                      setSpinYaml(null);
                      setSpinModify('ask');
                      refresh();
                    } catch (e: any) {
                      toast.error(e.message);
                      setSpinModify('ask');
                    }
                  }}
                >
                  Confirm & Spin
                </Button>
              </div>
            </div>
          ) : spinModify === 'modify' ? (
            <div className="space-y-3 py-2">
              <textarea
                value={spinModifiedContent}
                onChange={(e) => setSpinModifiedContent(e.target.value)}
                rows={16}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setSpinModify('ask')}>
                  Back
                </Button>
                <Button
                  onClick={async () => {
                    if (!spinYaml || !current) return;
                    try {
                      const parsed = yaml.load(spinModifiedContent) as any;
                      const services = parsed?.services;
                      const serviceName = services
                        ? Object.keys(services)[0]
                        : spinYaml.name.replace(/\.(yml|yaml)$/, '');
                      const folderName = serviceName;
                      const folderPath = current.rootFolder + '/' + folderName;
                      await api.writeFile(
                        folderPath + '/' + spinYaml.name,
                        spinModifiedContent,
                      );
                      await api.composeUpFromYaml(
                        folderPath + '/' + spinYaml.name,
                        spinModifiedContent,
                        current.id,
                      );
                      toast.success('Modified container spun from new folder');
                      setSpinYaml(null);
                      setSpinModify('ask');
                      refresh();
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  Confirm & Spin
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      {/* Spin YAML dialog */}
      <Dialog
        open={!!spinYaml}
        onOpenChange={(o) => {
          if (!o) {
            setSpinYaml(null);
            setSpinModify('ask');
          }
        }}
      >
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono">
              Spin container from {spinYaml?.name}
            </DialogTitle>
            <DialogDescription>
              This will run docker compose up with this YAML file.
            </DialogDescription>
          </DialogHeader>
          {spinModify === 'ask' ? (
            <div className="space-y-3 py-2">
              <p className="text-sm text-muted-foreground">
                Would you like to modify the YAML before spinning the container?
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setSpinModifiedContent(spinYaml?.content || '');
                    setSpinModify('modify');
                  }}
                >
                  Yes, modify it
                </Button>
                <Button
                  onClick={async () => {
                    setSpinModify('direct');
                    if (!spinYaml || !current) return;
                    try {
                      await api.composeUpFromYaml(
                        spinYaml.path,
                        spinYaml.content,
                        current.id,
                      );
                      toast.success('Container spun from ' + spinYaml.name);
                      setSpinYaml(null);
                      setSpinModify('ask');
                      refresh();
                    } catch (e: any) {
                      toast.error(e.message);
                      setSpinModify('ask');
                    }
                  }}
                >
                  Confirm & Spin
                </Button>
              </div>
            </div>
          ) : spinModify === 'modify' ? (
            <div className="space-y-3 py-2">
              <textarea
                value={spinModifiedContent}
                onChange={(e) => setSpinModifiedContent(e.target.value)}
                rows={16}
                className="w-full rounded-md border bg-background px-3 py-2 font-mono text-xs"
              />
              <div className="flex gap-2 justify-end">
                <Button variant="ghost" onClick={() => setSpinModify('ask')}>
                  Back
                </Button>
                <Button
                  onClick={async () => {
                    if (!spinYaml || !current) return;
                    try {
                      const parsed = yaml.load(spinModifiedContent) as any;
                      const services = parsed?.services;
                      const serviceName = services
                        ? Object.keys(services)[0]
                        : spinYaml.name.replace(/\.(yml|yaml)$/, '');
                      const folderName = serviceName;
                      const folderPath = current.rootFolder + '/' + folderName;
                      await api.writeFile(
                        folderPath + '/' + spinYaml.name,
                        spinModifiedContent,
                      );
                      await api.composeUpFromYaml(
                        folderPath + '/' + spinYaml.name,
                        spinModifiedContent,
                        current.id,
                      );
                      toast.success('Modified container spun from new folder');
                      setSpinYaml(null);
                      setSpinModify('ask');
                      refresh();
                    } catch (e: any) {
                      toast.error(e.message);
                    }
                  }}
                >
                  Confirm & Spin
                </Button>
              </div>
            </div>
          ) : null}
        </DialogContent>
      </Dialog>

      <FolderTerminalDialog
        open={terminalOpen}
        onOpenChange={setTerminalOpen}
        cwd={terminalCwd}
        title={
          selected
            ? `Terminal · ${selected.name}`
            : `Terminal · ${current.rootFolder || 'workspace'}`
        }
      />
    </div>
  );
}

function RenameDialog({
  node,
  value,
  onValue,
  onClose,
  onConfirm,
}: {
  node: YamlFile | null;
  value: string;
  onValue: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!node} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            Rename {node?.name}
          </DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && onConfirm()}
          className="font-mono text-sm"
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={onConfirm}>Rename</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function DeleteDialog({
  node,
  onClose,
  onConfirm,
}: {
  node: YamlFile | null;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog open={!!node} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Delete {node?.name}?</AlertDialogTitle>
          <AlertDialogDescription>
            This will remove the{' '}
            {node?.isDir ? 'folder and all its contents' : 'file'} from this
            workspace. This action cannot be undone.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            Delete
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function CreateDialog({
  state,
  value,
  onValue,
  onClose,
  onConfirm,
}: {
  state: { parent: YamlFile; isDir: boolean } | null;
  value: string;
  onValue: (v: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog open={!!state} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-mono text-sm">
            New {state?.isDir ? 'folder' : 'file'} in {state?.parent.name}
          </DialogTitle>
        </DialogHeader>
        <Input
          autoFocus
          value={value}
          onChange={(e) => onValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && value.trim()) {
              e.preventDefault();
              onConfirm();
            }
          }}
          className="font-mono text-sm"
          placeholder={state?.isDir ? 'folder-name' : 'filename.ext'}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button disabled={!value.trim()} onClick={onConfirm}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BackupsList({
  backups,
  loading = false,
  onRefresh,
  onRestore,
}: {
  backups: Array<{
    name: string;
    path: string;
    createdAt: string;
    fileCount: number;
    size: number;
  }>;
  loading?: boolean;
  onRefresh?: () => void;
  onRestore: (snapshot: string) => void;
}) {
  return (
    <div className="space-y-3">
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
          <span>server backups</span>
          <div className="flex items-center gap-2">
            <span>{backups.length} snapshots</span>
            {onRefresh && (
              <Button
                size="icon"
                variant="ghost"
                className="h-5 w-5 text-muted-foreground hover:text-foreground"
                onClick={onRefresh}
                disabled={loading}
                title="Refresh backups"
              >
                <IconRefresh
                  className={cn('h-3 w-3', loading && 'animate-spin')}
                  stroke={1.75}
                />
              </Button>
            )}
          </div>
        </div>
        <ScrollArea className="h-[200px]">
          {loading && backups.length === 0 ? (
            <div className="grid h-[120px] place-items-center text-center">
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <IconRefresh className="h-4 w-4 animate-spin" stroke={1.75} />
                <span>Loading backups…</span>
              </div>
            </div>
          ) : backups.length === 0 ? (
            <div className="grid h-[100px] place-items-center text-center">
              <div>
                <IconArchive
                  className="mx-auto mb-1 h-5 w-5 text-muted-foreground"
                  stroke={1.75}
                />
                <div className="text-xs text-muted-foreground">
                  No backups yet
                </div>
              </div>
            </div>
          ) : (
            <ul className="divide-y">
              {backups.map((r) => (
                <li
                  key={r.name}
                  className="flex items-center justify-between gap-3 px-3 py-2 font-mono text-xs"
                >
                  <div className="flex items-center gap-2 truncate">
                    <IconArchive
                      className="h-3.5 w-3.5 text-muted-foreground"
                      stroke={1.75}
                    />
                    <span className="truncate">{r.name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
                    <span>{r.fileCount} files</span>
                    <span>{new Date(r.createdAt).toLocaleString()}</span>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6"
                      onClick={() => onRestore(r.name)}
                      title="Restore"
                    >
                      <IconRestore className="h-3 w-3" stroke={1.75} />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </Card>
    </div>
  );
}

function EnvEditor({
  file,
  onChange,
}: {
  file: YamlFile;
  onChange: (env: EnvVar[]) => Promise<void> | void;
}) {
  const [showSecrets, setShowSecrets] = useState(false);
  const [localEnv, setLocalEnv] = useState<EnvVar[]>(() => file.env ?? []);
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const lastFileIdRef = useRef<string>(file.id);

  // Sync state if a different file is selected
  useEffect(() => {
    if (file.id !== lastFileIdRef.current) {
      lastFileIdRef.current = file.id;
      setLocalEnv(file.env ?? []);
      setIsDirty(false);
    }
  }, [file.id, file.env]);

  const saveChanges = useCallback(
    async (varsToSave: EnvVar[], silent = false) => {
      let toastId: string | number | undefined;
      if (!silent) {
        toastId = toast.loading('Saving .env…');
      }
      try {
        setIsSaving(true);
        await onChange(varsToSave);
        setIsDirty(false);
        if (!silent && toastId) {
          toast.success('.env saved', { id: toastId });
        }
      } catch (err: any) {
        if (!silent && toastId) {
          toast.error(err?.message || 'Failed to save .env', { id: toastId });
        } else {
          toast.error(err?.message || 'Failed to save .env');
        }
      } finally {
        setIsSaving(false);
      }
    },
    [onChange],
  );

  // Debounced auto-save: saves 600ms after user finishes editing
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      saveChanges(localEnv, true);
    }, 600);
    return () => clearTimeout(timer);
  }, [localEnv, isDirty, saveChanges]);

  const update = (i: number, patch: Partial<EnvVar>) => {
    setLocalEnv((prev) => {
      const next = prev.map((e, idx) => (idx === i ? { ...e, ...patch } : e));
      return next;
    });
    setIsDirty(true);
  };

  const remove = (i: number) => {
    setLocalEnv((prev) => {
      const next = prev.filter((_, idx) => idx !== i);
      saveChanges(next, true);
      return next;
    });
  };

  const add = () => {
    setLocalEnv((prev) => {
      const next = [...prev, { key: 'NEW_KEY', value: '' }];
      saveChanges(next, true);
      return next;
    });
  };

  const importDotEnv = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.env,.env.example,.txt';
    input.onchange = async (e) => {
      const selectedFile = (e.target as HTMLInputElement).files?.[0];
      if (!selectedFile) return;
      const text = await selectedFile.text();
      const lines = text
        .split('\n')
        .filter((l) => l.trim() && !l.startsWith('#'));
      const parsed: EnvVar[] = lines.map((l) => {
        const eqIdx = l.indexOf('=');
        if (eqIdx === -1) return { key: l.trim(), value: '' };
        return {
          key: l.slice(0, eqIdx).trim(),
          value: l.slice(eqIdx + 1).trim(),
          secret: /pass|secret|token|key|password/i.test(l.slice(0, eqIdx)),
        };
      });
      setLocalEnv(parsed);
      await saveChanges(parsed, false);
      toast.success(`Imported ${parsed.length} variables from ${selectedFile.name}`);
    };
    input.click();
  };

  const copyDotEnv = async () => {
    const txt = localEnv.map((e) => `${e.key}=${e.value}`).join('\n');
    try {
      await copyForExplorer(txt);
      toast.success('.env copied');
    } catch {
      toast.error('Clipboard not available');
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
        <div className="flex items-center gap-2 font-mono text-[11px] uppercase tracking-widest text-muted-foreground">
          <IconKey className="h-3.5 w-3.5 text-emerald-500" stroke={1.75} />
          {file.path.replace(/\/[^/]+$/, '')}/.env
          <Badge variant="secondary" className="h-4 px-1 text-[10px]">
            {localEnv.length} vars
          </Badge>
          {isDirty && (
            <Badge variant="outline" className="h-4 px-1 text-[10px] text-amber-500 border-amber-500/30">
              unsaved
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-md px-2"
            onClick={() => setShowSecrets((v) => !v)}
            title={showSecrets ? 'Hide secrets' : 'Show secrets'}
          >
            {showSecrets ? (
              <IconEyeOff className="h-3.5 w-3.5" stroke={1.75} />
            ) : (
              <IconEye className="h-3.5 w-3.5" stroke={1.75} />
            )}
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-md px-2"
            onClick={copyDotEnv}
            title="Copy all variables"
          >
            <IconCopy className="h-3.5 w-3.5" stroke={1.75} />
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-7 rounded-md px-2"
            onClick={importDotEnv}
            title="Import from file"
          >
            <IconUpload className="h-3.5 w-3.5" stroke={1.75} />
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="h-7 gap-1 rounded-md px-2 text-xs"
            onClick={add}
          >
            <IconPlus className="h-3.5 w-3.5" stroke={1.75} /> Add
          </Button>
          <Button
            size="sm"
            variant={isDirty ? 'default' : 'outline'}
            className="h-7 gap-1 rounded-md px-2 text-xs"
            disabled={isSaving || !isDirty}
            onClick={() => saveChanges(localEnv, false)}
          >
            {isSaving ? (
              <IconRefresh className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <IconCheck className="h-3.5 w-3.5" stroke={1.75} />
            )}
            {isSaving ? 'Saving…' : isDirty ? 'Save' : 'Saved'}
          </Button>
        </div>
      </div>
      {localEnv.length === 0 ? (
        <div className="grid h-[220px] place-items-center text-center p-4">
          <div className="flex flex-col items-center gap-2">
            <IconKey
              className="mx-auto mb-1 h-8 w-8 text-muted-foreground/60"
              stroke={1.75}
            />
            <div className="text-sm font-medium">No environment variables</div>
            <div className="text-xs text-muted-foreground max-w-xs">
              Configure environment variables for this stack, or import from an existing .env file.
            </div>
            <div className="flex items-center gap-2 mt-2">
              <Button
                size="sm"
                className="h-8 gap-1.5 text-xs"
                onClick={() => {
                  const initial = [{ key: 'PORT', value: '8080', secret: false }];
                  setLocalEnv(initial);
                  saveChanges(initial, false);
                }}
              >
                <IconPlus className="h-3.5 w-3.5" stroke={1.75} /> Create .env file
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-8 gap-1.5 text-xs"
                onClick={importDotEnv}
              >
                <IconUpload className="h-3.5 w-3.5" stroke={1.75} /> Import file
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <ScrollArea className="h-[320px]">
          <ul className="divide-y">
            {localEnv.map((v, i) => (
              <li key={i} className="flex items-center gap-2 px-3 py-1.5">
                <Input
                  value={v.key}
                  onChange={(e) => update(i, { key: e.target.value })}
                  className="h-8 w-52 font-mono text-xs"
                  placeholder="KEY"
                />
                <span className="font-mono text-xs text-muted-foreground">
                  =
                </span>
                <Input
                  value={v.value}
                  type={v.secret && !showSecrets ? 'password' : 'text'}
                  onChange={(e) => update(i, { value: e.target.value })}
                  className="h-8 flex-1 font-mono text-xs"
                  placeholder="value"
                />
                <Button
                  size="sm"
                  variant={v.secret ? 'secondary' : 'ghost'}
                  className="h-8 px-2 text-[10px]"
                  onClick={() => update(i, { secret: !v.secret })}
                  title="Mark as secret"
                >
                  secret
                </Button>
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-8 w-8"
                  onClick={() => remove(i)}
                  title="Remove variable"
                >
                  <IconTrash
                    className="h-3.5 w-3.5 text-destructive"
                    stroke={1.75}
                  />
                </Button>
              </li>
            ))}
          </ul>
        </ScrollArea>
      )}
    </Card>
  );
}

function FileTree({
  node,
  level,
  selectedId,
  onSelect,
  onAction,
}: {
  node: YamlFile & {
    envFile?: { name: string; path: string; content: string };
  };
  level: number;
  selectedId: string | null;
  onSelect: (id: string) => void;
  onAction: (
    node: YamlFile,
    a: 'rename' | 'delete' | 'duplicate' | 'new-file' | 'new-folder' | 'new-env',
  ) => void;
}) {
  const isSelected = node.id === selectedId;
  const [open, setOpen] = useState(level === 0);

  if (!node.isDir) {
    return (
      <div
        className={cn(
          'group flex items-center gap-1 rounded-md px-2 py-1 text-sm transition-colors hover:bg-accent',
          isSelected && 'bg-accent',
        )}
        style={{ paddingLeft: level * 12 + 8 }}
      >
        <IconFile
          className="h-3.5 w-3.5 shrink-0 text-muted-foreground"
          stroke={1.75}
        />
        <button
          type="button"
          className="flex-1 truncate text-left"
          onClick={() => onSelect(node.id)}
        >
          {node.name}
        </button>
      </div>
    );
  }

  // Show .env file as a child entry if present
  const envFile = node.envFile;
  const hasEnv = !!envFile;

  return (
    <div>
      <div
        className="group flex items-center rounded-md pr-1 transition-colors hover:bg-accent"
        style={{ paddingLeft: level * 12 + 4 }}
      >
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex flex-1 items-center gap-1 py-1 text-sm text-left"
        >
          {open ? (
            <IconChevronDown className="h-3.5 w-3.5 shrink-0" stroke={1.75} />
          ) : (
            <IconChevronRight className="h-3.5 w-3.5 shrink-0" stroke={1.75} />
          )}
          {open ? (
            <IconFolderOpen
              className="h-3.5 w-3.5 shrink-0 text-foreground/70"
              stroke={1.75}
            />
          ) : (
            <IconFolder
              className="h-3.5 w-3.5 shrink-0 text-foreground/70"
              stroke={1.75}
            />
          )}
          <span className="truncate font-medium">{node.name}</span>
        </button>
        {level > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                size="icon"
                variant="ghost"
                className="h-6 w-6 opacity-0 transition-opacity group-hover:opacity-100"
              >
                <IconDots className="h-3.5 w-3.5" stroke={1.75} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => onAction(node, 'new-file')}>
                <IconFile className="mr-2 h-3.5 w-3.5" stroke={1.75} /> New file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction(node, 'new-folder')}>
                <IconFolderPlus className="mr-2 h-3.5 w-3.5" stroke={1.75} />{' '}
                New folder
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction(node, 'new-env')}>
                <IconKey className="mr-2 h-3.5 w-3.5" stroke={1.75} /> New .env file
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onAction(node, 'rename')}>
                <IconPencil className="mr-2 h-3.5 w-3.5" stroke={1.75} /> Rename
              </DropdownMenuItem>
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onAction(node, 'delete')}
              >
                <IconTrash className="mr-2 h-3.5 w-3.5" stroke={1.75} /> Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      {open &&
        (level >= 3 ? (
          <div
            className="px-2 py-1 text-[11px] text-muted-foreground/60 italic"
            style={{ paddingLeft: (level + 1) * 12 + 4 }}
          >
            Max display hierarchy reached
          </div>
        ) : (
          (node.children ?? []).map((c) => (
            <FileTree
              key={c.id}
              node={c}
              level={level + 1}
              selectedId={selectedId}
              onSelect={onSelect}
              onAction={onAction}
            />
          ))
        ))}
      {/* Show .env file at the end of the tree if present */}
      {hasEnv && (
        <button
          type="button"
          key="env"
          onClick={() => {
            if (node.children && node.children.length > 0) {
              const yamlChild = node.children.find((c) => !c.isDir) || node.children[0];
              onSelect(yamlChild.id);
            }
          }}
          className={cn(
            'group flex w-full items-center gap-1.5 rounded-md px-2 py-1 text-sm text-left transition-colors hover:bg-accent',
            isSelected && 'bg-accent',
          )}
          style={{ paddingLeft: (level + 1) * 12 + 8 }}
        >
          <IconKey
            className="h-3.5 w-3.5 shrink-0 text-emerald-500"
            stroke={1.75}
          />
          <span className="truncate font-mono text-xs font-medium">.env</span>
          <Badge variant="secondary" className="ml-auto text-[10px] h-4 px-1 text-muted-foreground">
            {node.env?.length ?? 0}
          </Badge>
        </button>
      )}
    </div>
  );
}
