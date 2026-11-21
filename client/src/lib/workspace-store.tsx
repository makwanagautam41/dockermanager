import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  ActivityEvent,
  AlertRule,
  ChatMessage,
  Density,
  EnvFileEntry,
  EnvVar,
  Snippet,
  Stack,
  YamlFile,
  YamlVersion,
  Workspace,
} from "./types";
import { api } from "./api";
import { getStoredToken, setToken } from "./api";
import { uuid } from "./utils";

export { getStoredToken, setToken };

interface WorkspaceStore {
  workspaces: Workspace[];
  currentId: string | null;
  current: Workspace | null;
  stacksByWs: Record<string, Stack[]>;
  treeByWs: Record<string, YamlFile | null>;
  chatByWs: Record<string, ChatMessage[]>;
  chatByStack: Record<string, ChatMessage[]>;
  activityByWs: Record<string, ActivityEvent[]>;
  snippetsByWs: Record<string, Snippet[]>;
  alertsByWs: Record<string, AlertRule[]>;
  envFilesByWs: Record<string, EnvFileEntry[]>;
  yamlHistoryByStack: Record<string, YamlVersion[]>;
  density: Density;
  hydrated: boolean;
  loading: boolean;
  error: string | null;

  setCurrent: (id: string) => void;
  setDensity: (d: Density) => void;
  refresh: () => Promise<void>;
  refreshStacks: () => Promise<void>;
  ensureTree: (workspaceId?: string, force?: boolean) => Promise<void>;
  ensureStacks: (workspaceId?: string) => Promise<void>;
  ensureDashboard: (workspaceId?: string) => Promise<void>;
  addWorkspace: (
    name: string,
    opts?: { description?: string; color?: string; icon?: string; rootFolderPath?: string },
  ) => Promise<Workspace>;
  updateWorkspace: (
    id: string,
    patch: {
      name?: string;
      description?: string;
      color?: string;
      icon?: string;
      rootFolderPath?: string;
    },
  ) => Promise<void>;
  deleteWorkspace: (id: string, alsoDeleteFolder?: boolean) => Promise<void>;

  addStack: (workspaceId: string, stack: Stack) => void;
  updateStack: (workspaceId: string, stackId: string, patch: Partial<Stack>) => void;
  deleteStack: (workspaceId: string, stackId: string) => Promise<void>;
  applyStackYaml: (workspaceId: string, stackId: string) => void;

  updateYamlFile: (workspaceId: string, fileId: string, content: string) => void;
  updateYamlEnv: (workspaceId: string, fileId: string, env: EnvVar[]) => void;
  renameYamlNode: (workspaceId: string, fileId: string, newName: string) => void;
  deleteYamlNode: (workspaceId: string, fileId: string) => void;
  duplicateYamlNode: (workspaceId: string, fileId: string) => string | null;
  createYamlChild: (
    workspaceId: string,
    parentId: string,
    name: string,
    isDir: boolean,
  ) => string | null;

  appendChat: (workspaceId: string, msg: ChatMessage) => void;
  clearChat: (workspaceId: string) => void;
  appendStackChat: (stackId: string, msg: ChatMessage) => void;
  clearStackChat: (stackId: string) => void;

  pushActivity: (workspaceId: string, ev: Omit<ActivityEvent, "id" | "ts">) => void;
  clearActivity: (workspaceId: string) => void;

  addSnippet: (workspaceId: string, s: Snippet) => void;
  deleteSnippet: (workspaceId: string, id: string) => void;

  addAlert: (workspaceId: string, a: AlertRule) => void;
  updateAlert: (workspaceId: string, id: string, patch: Partial<AlertRule>) => void;
  deleteAlert: (workspaceId: string, id: string) => void;

  updateEnvFile: (workspaceId: string, id: string, vars: EnvFileEntry["vars"]) => void;
  addEnvFile: (workspaceId: string, e: EnvFileEntry) => void;

  pushYamlVersion: (stackId: string, v: YamlVersion) => void;

  exportAll: () => string;
  importAll: (json: string) => boolean;
}

const Ctx = createContext<WorkspaceStore | null>(null);
const STORAGE_KEY = "dockermanager-state-v2";
const TOKEN_STORAGE_KEY = "dockermanager-api-token";
const DEFAULT_WORKSPACE_ID = "local-host";
const DEFAULT_WORKSPACE_ROOT =
  (typeof import.meta !== "undefined" && import.meta.env?.VITE_DEFAULT_WORKSPACE_ROOT) ||
  "docker-yaml-files";

function createDefaultWorkspace(): Workspace {
  return {
    id: DEFAULT_WORKSPACE_ID,
    name: "Local host",
    description: "Global Docker host view",
    color: "#0f766e",
    icon: "Server",
    rootFolder: DEFAULT_WORKSPACE_ROOT,
    ollamaConnected: false,
    models: [],
    createdAt: new Date().toISOString(),
  };
}

interface Persisted {
  currentId: string | null;
  chatByWs: Record<string, ChatMessage[]>;
  chatByStack: Record<string, ChatMessage[]>;
  snippetsByWs: Record<string, Snippet[]>;
  alertsByWs: Record<string, AlertRule[]>;
  envFilesByWs: Record<string, EnvFileEntry[]>;
  yamlHistoryByStack: Record<string, YamlVersion[]>;
  density: Density;
}

export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const [workspaces, setWorkspaces] = useState<Workspace[]>(() => [createDefaultWorkspace()]);
  const [currentId, setCurrentId] = useState<string | null>(DEFAULT_WORKSPACE_ID);
  const [stacksByWs, setStacksByWs] = useState<Record<string, Stack[]>>({});
  const [treeByWs, setTreeByWs] = useState<Record<string, YamlFile | null>>({});
  const [chatByWs, setChatByWs] = useState<Record<string, ChatMessage[]>>({});
  const [chatByStack, setChatByStack] = useState<Record<string, ChatMessage[]>>({});
  const [activityByWs, setActivityByWs] = useState<Record<string, ActivityEvent[]>>({});
  const [snippetsByWs, setSnippetsByWs] = useState<Record<string, Snippet[]>>({});
  const [alertsByWs, setAlertsByWs] = useState<Record<string, AlertRule[]>>({});
  const [envFilesByWs, setEnvFilesByWs] = useState<Record<string, EnvFileEntry[]>>({});
  const [yamlHistoryByStack, setYamlHistoryByStack] = useState<Record<string, YamlVersion[]>>({});
  const [density, setDensityState] = useState<Density>("comfortable");
  const [hydrated, setHydrated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadWorkspaces = useCallback(async () => {
    setLoading(true);
    setError(null);
    setWorkspaces((prev) => (prev.length > 0 ? prev : [createDefaultWorkspace()]));
    setCurrentId((prev) => prev || DEFAULT_WORKSPACE_ID);
    setLoading(false);
    setHydrated(true);
  }, []);

  const loadStacks = useCallback(async () => {
    if (!currentId) return;
    const stacks = await api.listStacks(currentId).catch(() => [] as Stack[]);
    setStacksByWs((prev) => ({ ...prev, [currentId]: stacks }));
  }, [currentId]);

  const loadDashboard = useCallback(async () => {
    if (!currentId) return;
    const dash = await api.getDashboard().catch(() => null);
    if (!dash) return;
    setActivityByWs((prev) => {
      const local = prev[currentId] ?? [];
      const remote = (dash.recentActivity as ActivityEvent[]) ?? [];
      const byId = new Map<string, ActivityEvent>();
      for (const e of remote) byId.set(e.id, e);
      for (const e of local) if (!byId.has(e.id)) byId.set(e.id, e);
      const merged = [...byId.values()].sort(
        (a, b) => new Date(b.ts).getTime() - new Date(a.ts).getTime(),
      );
      return { ...prev, [currentId]: merged.slice(0, 100) };
    });
  }, [currentId]);

  useEffect(() => {
    const savedToken = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (savedToken) setToken(savedToken);
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const p: Persisted = JSON.parse(raw);
        setCurrentId(p.currentId ?? null);
        setChatByWs(p.chatByWs ?? {});
        setChatByStack(p.chatByStack ?? {});
        setSnippetsByWs(p.snippetsByWs ?? {});
        setAlertsByWs(p.alertsByWs ?? {});
        setEnvFilesByWs(p.envFilesByWs ?? {});
        setYamlHistoryByStack(p.yamlHistoryByStack ?? {});
        setDensityState(p.density ?? "comfortable");
      }
    } catch {
      setError(null);
    }
    loadWorkspaces();
  }, [loadWorkspaces]);

  // In-memory frontend cache for file tree
  const treeCache = useRef<Map<string, { tree: YamlFile; timestamp: number }>>(new Map());

  const ensureTree = useCallback(
    async (workspaceId?: string, force = false) => {
      const wsId = workspaceId || currentId;
      if (!wsId) return;
      const ws = workspaces.find((w) => w.id === wsId);
      if (!ws || !ws.rootFolder) {
        setTreeByWs((prev) => ({ ...prev, [wsId]: null }));
        return;
      }

      const cached = treeCache.current.get(wsId);
      const now = Date.now();
      if (!force && cached && now - cached.timestamp < 60000) {
        setTreeByWs((prev) => ({ ...prev, [wsId]: cached.tree }));
        return;
      }

      if (cached) {
        setTreeByWs((prev) => ({ ...prev, [wsId]: cached.tree }));
      }

      try {
        const { tree, envFiles } = await api.getFileTree(ws.rootFolder);
        const mergeEnvIntoTree = (node: any): any => {
          if (!node) return node;
          const envFile = envFiles?.find((ef) => ef.path === node.path);
          if (envFile && envFile.content) {
            node.env = envFile.content
              .split("\n")
              .filter((l: string) => l.trim() && !l.startsWith("#"))
              .map((l: string) => {
                const eqIdx = l.indexOf("=");
                if (eqIdx === -1) return { key: l.trim(), value: "" };
                return {
                  key: l.slice(0, eqIdx).trim(),
                  value: l.slice(eqIdx + 1).trim(),
                  secret: /pass|secret|token|key|password/i.test(l.slice(0, eqIdx)),
                };
              });
          }
          if (node.children) {
            node.children = node.children.map(mergeEnvIntoTree);
          }
          return node;
        };
        const processedTree = tree ? mergeEnvIntoTree(tree) : null;
        if (processedTree) {
          treeCache.current.set(wsId, { tree: processedTree, timestamp: Date.now() });
        }
        setTreeByWs((prev) => ({ ...prev, [wsId]: processedTree }));
      } catch {
        if (!cached) {
          setTreeByWs((prev) => ({ ...prev, [wsId]: null }));
        }
      }
    },
    [currentId, workspaces],
  );

  const loadTree = ensureTree;

  // On initial workspace selection, do not load tree (lazy on-demand only for Explorer)
  useEffect(() => {
    if (currentId) {
      loadStacks();
    }
  }, [currentId, loadStacks]);

  useEffect(() => {
    if (!hydrated) return;
    const p: Persisted = {
      currentId,
      chatByWs,
      chatByStack,
      snippetsByWs,
      alertsByWs,
      envFilesByWs,
      yamlHistoryByStack,
      density,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  }, [
    currentId,
    chatByWs,
    chatByStack,
    snippetsByWs,
    alertsByWs,
    envFilesByWs,
    yamlHistoryByStack,
    density,
    hydrated,
  ]);

  useEffect(() => {
    document.documentElement.dataset.density = density;
  }, [density]);

  const current = useMemo(
    () => workspaces.find((w) => w.id === currentId) ?? null,
    [workspaces, currentId],
  );

  const setCurrent = useCallback((id: string) => {
    setCurrentId(id);
  }, []);

  const setDensity = useCallback((d: Density) => setDensityState(d), []);

  const refresh = useCallback(async () => {
    await Promise.allSettled([
      loadWorkspaces(),
      loadStacks(),
      loadDashboard(),
      ensureTree(undefined, true),
    ]);
  }, [loadWorkspaces, loadStacks, loadDashboard, ensureTree]);

  const refreshStacks = useCallback(async () => {
    await loadStacks();
  }, [loadStacks]);

  const pushActivity = useCallback((workspaceId: string, ev: Omit<ActivityEvent, "id" | "ts">) => {
    const id = uuid();
    const full: ActivityEvent = {
      ...ev,
      id,
      ts: new Date().toISOString(),
    };
    setActivityByWs((prev) => ({
      ...prev,
      [workspaceId]: [full, ...(prev[workspaceId] ?? [])].slice(0, 100),
    }));
  }, []);

  const clearActivity = useCallback((workspaceId: string) => {
    setActivityByWs((prev) => ({ ...prev, [workspaceId]: [] }));
  }, []);

  const addWorkspace = useCallback(
    async (
      name: string,
      opts?: { description?: string; color?: string; icon?: string; rootFolderPath?: string },
    ) => {
      const workspace: Workspace = {
        id: uuid(),
        name,
        description: opts?.description,
        color: opts?.color || "#0f766e",
        icon: opts?.icon || "Server",
        rootFolder: opts?.rootFolderPath || DEFAULT_WORKSPACE_ROOT,
        ollamaConnected: false,
        models: [],
        createdAt: new Date().toISOString(),
      };
      setWorkspaces([workspace]);
      setCurrentId(workspace.id);
      return workspace;
    },
    [],
  );

  const updateWorkspace = useCallback(
    async (
      id: string,
      patch: {
        name?: string;
        description?: string;
        color?: string;
        icon?: string;
        rootFolderPath?: string;
      },
    ) => {
      setWorkspaces((prev) =>
        prev.map((x) =>
          x.id === id
            ? {
                ...x,
                name: patch.name ?? x.name,
                description: patch.description ?? x.description,
                color: patch.color ?? x.color,
                icon: patch.icon ?? x.icon,
                rootFolder: patch.rootFolderPath ?? x.rootFolder,
              }
            : x,
        ),
      );
    },
    [],
  );

  const deleteWorkspace = useCallback(
    async (id: string, alsoDeleteFolder?: boolean) => {
      setWorkspaces((prev) =>
        prev.length > 1 ? prev.filter((w) => w.id !== id) : [createDefaultWorkspace()],
      );
      const strip = <T,>(prev: Record<string, T>) => {
        const { [id]: _d, ...rest } = prev;
        return rest;
      };
      setStacksByWs(strip);
      setTreeByWs(strip);
      setChatByWs(strip);
      setActivityByWs(strip);
      setSnippetsByWs(strip);
      setAlertsByWs(strip);
      setEnvFilesByWs(strip);
      if (currentId === id) setCurrentId(DEFAULT_WORKSPACE_ID);
    },
    [currentId, workspaces],
  );

  const addStack = useCallback((workspaceId: string, stack: Stack) => {
    setStacksByWs((prev) => ({
      ...prev,
      [workspaceId]: [...(prev[workspaceId] ?? []), stack],
    }));
  }, []);

  const updateStack = useCallback((workspaceId: string, stackId: string, patch: Partial<Stack>) => {
    setStacksByWs((prev) => ({
      ...prev,
      [workspaceId]: (prev[workspaceId] ?? []).map((s) =>
        s.id === stackId ? { ...s, ...patch } : s,
      ),
    }));
  }, []);

  const deleteStack = useCallback(
    async (workspaceId: string, stackId: string) => {
      const name = (stacksByWs[workspaceId] ?? []).find((s) => s.id === stackId)?.name;
      await api.deleteStack(stackId);
      setStacksByWs((prev) => ({
        ...prev,
        [workspaceId]: (prev[workspaceId] ?? []).filter((s) => s.id !== stackId),
      }));
      if (name) pushActivity(workspaceId, { kind: "delete", message: `stack removed: ${name}` });
    },
    [pushActivity, stacksByWs],
  );

  const applyStackYaml = useCallback((workspaceId: string, stackId: string) => {
    setStacksByWs((prev) => ({
      ...prev,
      [workspaceId]: (prev[workspaceId] ?? []).map((s) =>
        s.id === stackId ? { ...s, runningYaml: s.yaml } : s,
      ),
    }));
  }, []);

  const updateYamlFile = useCallback(
    (workspaceId: string, fileId: string, content: string) => {
      treeCache.current.delete(workspaceId);
      let targetPath = "";
      setTreeByWs((prev) => {
        const root = prev[workspaceId];
        if (!root) return prev;
        const clone: YamlFile = JSON.parse(JSON.stringify(root));
        const walk = (node: YamlFile): boolean => {
          if (node.id === fileId) {
            node.content = content;
            targetPath = node.path;
            return true;
          }
          if (node.children) for (const c of node.children) if (walk(c)) return true;
          return false;
        };
        walk(clone);
        return { ...prev, [workspaceId]: clone };
      });
      if (targetPath) {
        api.writeFile(targetPath, content).catch(() => loadTree());
      }
    },
    [loadTree],
  );

  const updateYamlEnv = useCallback(
    (workspaceId: string, fileId: string, env: EnvVar[]) => {
      treeCache.current.delete(workspaceId);
      let targetDir = "";
      setTreeByWs((prev) => {
        const root = prev[workspaceId];
        if (!root) return prev;
        const clone: YamlFile = JSON.parse(JSON.stringify(root));
        const walk = (node: YamlFile): boolean => {
          if (node.id === fileId) {
            node.env = env;
            targetDir = node.path.replace(/\/[^/]+$/, "");
            return true;
          }
          if (node.children) for (const c of node.children) if (walk(c)) return true;
          return false;
        };
        walk(clone);
        return { ...prev, [workspaceId]: clone };
      });
      if (targetDir) {
        const content = env.map((e) => `${e.key}=${e.value}`).join("\n");
        api.writeFile(`${targetDir}/.env`, content).catch(() => loadTree());
      }
    },
    [loadTree],
  );

  const mutateTree = useCallback((workspaceId: string, mutator: (root: YamlFile) => void) => {
    treeCache.current.delete(workspaceId);
    setTreeByWs((prev) => {
      const root = prev[workspaceId];
      if (!root) return prev;
      const clone: YamlFile = JSON.parse(JSON.stringify(root));
      mutator(clone);
      return { ...prev, [workspaceId]: clone };
    });
  }, []);

  const findNode = (root: YamlFile, id: string): YamlFile | null => {
    if (root.id === id) return root;
    for (const c of root.children ?? []) {
      const r = findNode(c, id);
      if (r) return r;
    }
    return null;
  };
  const findParent = (root: YamlFile, id: string): YamlFile | null => {
    for (const c of root.children ?? []) {
      if (c.id === id) return root;
      const r = findParent(c, id);
      if (r) return r;
    }
    return null;
  };

  const renameYamlNode = useCallback(
    (workspaceId: string, fileId: string, newName: string) => {
      let oldPath = "";
      mutateTree(workspaceId, (root) => {
        const node = findNode(root, fileId);
        if (!node) return;
        oldPath = node.path;
        node.name = newName;
        node.path = node.path.replace(/[^/]+$/, newName);
        if (node.children) {
          const fix = (n: YamlFile, parentPath: string) => {
            n.path = `${parentPath}/${n.name}`;
            n.children?.forEach((c) => fix(c, n.path));
          };
          node.children.forEach((c) => fix(c, node.path));
        }
      });
      if (oldPath) {
        api.renameNode(oldPath, newName).catch(() => loadTree());
      }
    },
    [mutateTree, loadTree],
  );

  const deleteYamlNode = useCallback(
    (workspaceId: string, fileId: string) => {
      let targetPath = "";
      mutateTree(workspaceId, (root) => {
        const node = findNode(root, fileId);
        if (node) targetPath = node.path;
        const parent = findParent(root, fileId);
        if (!parent || !parent.children) return;
        const idx = parent.children.findIndex((c) => c.id === fileId);
        if (idx >= 0) parent.children.splice(idx, 1);
      });
      if (targetPath) {
        api.deleteNode(targetPath).catch(() => loadTree());
      }
    },
    [mutateTree, loadTree],
  );

  const duplicateYamlNode = useCallback(
    (workspaceId: string, fileId: string): string | null => {
      let targetPath = "";
      let newId: string | null = null;
      mutateTree(workspaceId, (root) => {
        const parent = findParent(root, fileId);
        const node = findNode(root, fileId);
        if (!parent || !parent.children || !node) return;
        targetPath = node.path;
        const stamp = (n: YamlFile, parentPath: string, isRoot: boolean) => {
          const parts = n.name.split(".");
          if (parts.length > 1) {
            parts[parts.length - 2] += "-copy";
            n.name = parts.join(".");
          } else {
            n.name = `${n.name}-copy`;
          }
          n.id = uuid();
          n.path = `${parentPath}/${n.name}`;
          n.children?.forEach((c) => stamp(c, n.path, false));
        };
        const clone: YamlFile = JSON.parse(JSON.stringify(node));
        stamp(clone, parent.path, true);
        newId = clone.id;
        const idx = parent.children.findIndex((c) => c.id === fileId);
        parent.children.splice(idx + 1, 0, clone);
      });
      if (targetPath) {
        api
          .duplicateFile(targetPath)
          .then(() => loadTree())
          .catch(() => loadTree());
      }
      return newId;
    },
    [mutateTree, loadTree],
  );

  const createYamlChild = useCallback(
    (workspaceId: string, parentId: string, name: string, isDir: boolean): string | null => {
      let targetParentPath = "";
      let newId: string | null = null;
      const content = isDir ? "" : `# ${name}\n`;
      mutateTree(workspaceId, (root) => {
        const parent = findNode(root, parentId);
        if (!parent || !parent.isDir) return;
        targetParentPath = parent.path;
        parent.children ??= [];
        const child: YamlFile = {
          id: uuid(),
          name,
          path: `${parent.path}/${name}`,
          isDir,
          content,
          children: isDir ? [] : undefined,
          env: isDir ? undefined : [],
        };
        newId = child.id;
        parent.children.push(child);
      });
      if (targetParentPath) {
        if (isDir) {
          api.createFolder(targetParentPath, name).catch(() => loadTree());
        } else {
          api.writeFile(`${targetParentPath}/${name}`, content).catch(() => loadTree());
        }
      }
      return newId;
    },
    [mutateTree, loadTree],
  );

  const appendChat = useCallback((workspaceId: string, msg: ChatMessage) => {
    setChatByWs((prev) => ({
      ...prev,
      [workspaceId]: [...(prev[workspaceId] ?? []), msg],
    }));
  }, []);

  const clearChat = useCallback((workspaceId: string) => {
    setChatByWs((prev) => ({ ...prev, [workspaceId]: [] }));
  }, []);

  const appendStackChat = useCallback((stackId: string, msg: ChatMessage) => {
    setChatByStack((prev) => ({
      ...prev,
      [stackId]: [...(prev[stackId] ?? []), msg],
    }));
  }, []);

  const clearStackChat = useCallback((stackId: string) => {
    setChatByStack((prev) => ({ ...prev, [stackId]: [] }));
  }, []);

  const addSnippet = useCallback((workspaceId: string, s: Snippet) => {
    setSnippetsByWs((prev) => ({
      ...prev,
      [workspaceId]: [s, ...(prev[workspaceId] ?? [])],
    }));
  }, []);
  const deleteSnippet = useCallback((workspaceId: string, id: string) => {
    setSnippetsByWs((prev) => ({
      ...prev,
      [workspaceId]: (prev[workspaceId] ?? []).filter((s) => s.id !== id),
    }));
  }, []);

  const addAlert = useCallback((workspaceId: string, a: AlertRule) => {
    setAlertsByWs((prev) => ({
      ...prev,
      [workspaceId]: [a, ...(prev[workspaceId] ?? [])],
    }));
  }, []);
  const updateAlert = useCallback((workspaceId: string, id: string, patch: Partial<AlertRule>) => {
    setAlertsByWs((prev) => ({
      ...prev,
      [workspaceId]: (prev[workspaceId] ?? []).map((a) => (a.id === id ? { ...a, ...patch } : a)),
    }));
  }, []);
  const deleteAlert = useCallback((workspaceId: string, id: string) => {
    setAlertsByWs((prev) => ({
      ...prev,
      [workspaceId]: (prev[workspaceId] ?? []).filter((a) => a.id !== id),
    }));
  }, []);

  const updateEnvFile = useCallback(
    (workspaceId: string, id: string, vars: EnvFileEntry["vars"]) => {
      setEnvFilesByWs((prev) => ({
        ...prev,
        [workspaceId]: (prev[workspaceId] ?? []).map((e) => (e.id === id ? { ...e, vars } : e)),
      }));
    },
    [],
  );
  const addEnvFile = useCallback((workspaceId: string, e: EnvFileEntry) => {
    setEnvFilesByWs((prev) => ({
      ...prev,
      [workspaceId]: [e, ...(prev[workspaceId] ?? [])],
    }));
  }, []);

  const pushYamlVersion = useCallback((stackId: string, v: YamlVersion) => {
    setYamlHistoryByStack((prev) => ({
      ...prev,
      [stackId]: [v, ...(prev[stackId] ?? [])].slice(0, 50),
    }));
  }, []);

  const exportAll = useCallback((): string => {
    const p: Persisted = {
      currentId,
      chatByWs,
      chatByStack,
      snippetsByWs,
      alertsByWs,
      envFilesByWs,
      yamlHistoryByStack,
      density,
    };
    return JSON.stringify(p, null, 2);
  }, [
    currentId,
    chatByWs,
    chatByStack,
    snippetsByWs,
    alertsByWs,
    envFilesByWs,
    yamlHistoryByStack,
    density,
  ]);

  const importAll = useCallback((json: string): boolean => {
    try {
      const p: Persisted = JSON.parse(json);
      setCurrentId(p.currentId ?? null);
      setChatByWs(p.chatByWs ?? {});
      setChatByStack(p.chatByStack ?? {});
      setSnippetsByWs(p.snippetsByWs ?? {});
      setAlertsByWs(p.alertsByWs ?? {});
      setEnvFilesByWs(p.envFilesByWs ?? {});
      setYamlHistoryByStack(p.yamlHistoryByStack ?? {});
      setDensityState(p.density ?? "comfortable");
      return true;
    } catch {
      return false;
    }
  }, []);

  const value: WorkspaceStore = {
    workspaces,
    currentId,
    current,
    stacksByWs,
    treeByWs,
    chatByWs,
    chatByStack,
    activityByWs,
    snippetsByWs,
    alertsByWs,
    envFilesByWs,
    yamlHistoryByStack,
    density,
    hydrated,
    loading,
    error,
    setCurrent,
    setDensity,
    refresh,
    refreshStacks,
    ensureTree,
    ensureStacks: loadStacks,
    ensureDashboard: loadDashboard,
    addWorkspace,
    updateWorkspace,
    deleteWorkspace,
    addStack,
    updateStack,
    deleteStack,
    applyStackYaml,
    updateYamlFile,
    updateYamlEnv,
    renameYamlNode,
    deleteYamlNode,
    duplicateYamlNode,
    createYamlChild,
    appendChat,
    clearChat,
    appendStackChat,
    clearStackChat,
pushActivity,
    clearActivity,
    addSnippet,
    deleteSnippet,
    addAlert,
    updateAlert,
    deleteAlert,
    updateEnvFile,
    addEnvFile,
    pushYamlVersion,
    exportAll,
    importAll,
  };

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useWorkspaces() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useWorkspaces must be used inside WorkspaceProvider");
  return ctx;
}
