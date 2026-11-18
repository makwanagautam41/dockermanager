import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Group, Panel, Separator as ResizeSeparator } from "react-resizable-panels";
import {
  IconBug,
  IconCheck,
  IconHelpCircle,
  IconCopy,
  IconDownload,
  IconHistory,
  IconLayout,
  IconLayoutSidebar,
  IconPlus,
  IconLoader2,
  IconRobot,
  IconSettings,
  IconUpload,
  IconX,
} from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator as UiSeparator } from "@/components/ui/separator";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { cn } from "@/lib/utils";
import * as jsYaml from "js-yaml";
import { Textarea } from "@/components/ui/textarea";
import { Loader } from "@/components/loader";
import { analyzeYaml, type Finding, type AnalyzeResult } from "@/lib/compose-analyzer";
import { COMPOSE_REGISTRY, findOption, type OptionCategory, type OptionEntry } from "@/lib/compose-registry";
import { ollamaClient, type AIFocus, type AiSuggestion } from "@/lib/ollama-client";
import { api } from "@/lib/api";
import { useHealth } from "@/lib/health";

const DEFAULT_YAML = `services:
  web:
    image: nginx:alpine
    container_name: my-web
    ports:
      - "8080:80"
    restart: unless-stopped
`;

type View = "options" | "yaml" | "analysis";

interface OllamaCfg {
  connected: boolean;
  models: string[];
  model: string;
  baseUrl: string;
  error?: string;
}

export default function CreateYamlPage() {
  const [view, setView] = useState<View>("yaml");
  const [yaml, setYaml] = useState(DEFAULT_YAML);
  const [originalYaml, setOriginalYaml] = useState(DEFAULT_YAML);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<{ suggestions: AiSuggestion[] } | null>(null);
  const [aiAnalyzing, setAiAnalyzing] = useState(false);
  const [aiOpen, setAiOpen] = useState(false); // AI settings popover
  const [aiFocus, setAiFocus] = useState<AIFocus>("All");
  const [maskSecrets, setMaskSecrets] = useState(true);
  const [deployConfirm, setDeployConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const navigate = useNavigate();

  const docker = useHealth("dockerEngine");
  const [ollama, setOllama] = useState<OllamaCfg>({
    connected: false,
    models: [],
    model: localStorage.getItem("dm-ollama-model") || "",
    baseUrl: localStorage.getItem("dm-ollama-base-url") || "http://localhost:11434",
  });

  useEffect(() => {
    ollamaClient.check().then((r) =>
      setOllama((prev) => ({ ...prev, connected: r.connected, models: r.models, error: r.error })),
    );
  }, []);

  // Persist AI settings (replaces the removed Settings page per changes.md).
  useEffect(() => {
    if (ollama.model) localStorage.setItem("dm-ollama-model", ollama.model);
    if (ollama.baseUrl) localStorage.setItem("dm-ollama-base-url", ollama.baseUrl);
  }, [ollama.model, ollama.baseUrl]);

  const doc = useMemo<any | null>(() => {
    if (!yaml.trim()) return null;
    try {
      const d = jsYaml.load(yaml);
      return typeof d === "object" && !Array.isArray(d) && d ? d : null;
    } catch {
      return null;
    }
  }, [yaml]);

  // Detect which registry options are present in the current YAML (for left panel state).
  const presentKeys = useMemo(() => {
    const keys = new Set<string>();
    if (!doc) return keys;
    for (const k of Object.keys(doc)) {
      if (COMPOSE_REGISTRY.some((o) => o.key === k)) keys.add(k);
    }
    const svcs = doc.services;
    if (svcs && typeof svcs === "object" && !Array.isArray(svcs)) {
      for (const name of Object.keys(svcs)) {
        const s = svcs[name];
        if (typeof s !== "object" || Array.isArray(s) || !s) continue;
        for (const k of Object.keys(s)) {
          const base = k.replace(/(cap_add|cap_drop)$/, "$1");
          if (COMPOSE_REGISTRY.some((o) => o.key === `services.*.${k}` || o.key === `services.*.${base}`)) {
            keys.add(`services.*.${k}`);
          }
        }
        if (s.deploy && typeof s.deploy === "object") {
          keys.add("services.*.deploy.resources.limits/reservations");
        }
      }
    }
    return keys;
  }, [doc]);

  // Run built-in analysis whenever YAML changes (debounced via effect on doc).
  useEffect(() => {
    if (!doc) {
      setAnalysis(null);
      return;
    }
    setAnalyzing(true);
    // Use a microtask so the UI stays responsive.
    queueMicrotask(async () => {
      const result = analyzeYaml(yaml);
      setAnalysis(result);
      setAnalyzing(false);
    });
  }, [doc, yaml]);

  const counts = useMemo(
    () => (analysis ? analysis.counts : { error: 0, warning: 0, tip: 0 }),
    [analysis],
  );

  const canDeploy = useMemo(() => counts.error === 0 && Boolean(doc), [counts, doc]);

  // ---------- YAML mutators (two-way sync) ----------

  const withDoc = useCallback(
    (mutator: (d: any) => void) => {
      if (!doc) return;
      try {
        const clone = JSON.parse(JSON.stringify(doc));
        mutator(clone);
        const next = jsYaml.dump(clone, { indent: 2, lineWidth: -1 });
        setYaml(next);
      } catch {
        // ignore transient edits
      }
    },
    [doc, yaml, originalYaml],
  );

  const toggleServiceOption = useCallback(
    (key: string, on: boolean) => {
      withDoc((d) => {
        const svcs = d.services;
        if (!svcs || typeof svcs !== "object") return;
        const names = Object.keys(svcs);
        if (names.length === 0) return;
        const target = svcs[names[0]];
        if (!target || typeof target !== "object") return;
        switch (key) {
          case "services.*.restart":
            if (on) target.restart = "unless-stopped";
            else delete target.restart;
            break;
          case "services.*.image":
            if (on) target.image = "nginx:alpine";
            else delete target.image;
            break;
          case "services.*.container_name":
            if (on) target.container_name = `my-${names[0]}`;
            else delete target.container_name;
            break;
          case "services.*.command":
            if (on) target.command = "npm start";
            else delete target.command;
            break;
          case "services.*.entrypoint":
            if (on) target.entrypoint = "/entrypoint.sh";
            else delete target.entrypoint;
            break;
          case "services.*.user":
            if (on) target.user = "1000:1000";
            else delete target.user;
            break;
          case "services.*.working_dir":
            if (on) target.working_dir = "/app";
            else delete target.working_dir;
            break;
          case "services.*.privileged":
            if (on) target.privileged = true;
            else delete target.privileged;
            break;
          case "services.*.read_only":
            if (on) target.read_only = true;
            else delete target.read_only;
            break;
          case "services.*.stop_grace_period":
            if (on) target.stop_grace_period = "30s";
            else delete target.stop_grace_period;
            break;
          case "services.*.ports":
            if (on) {
              target.ports = [...(Array.isArray(target.ports) ? target.ports : []), "8080:80"];
            } else delete target.ports;
            break;
          case "services.*.volumes":
            if (on) {
              target.volumes = [...(Array.isArray(target.volumes) ? target.volumes : []), "data:/data"];
            } else delete target.volumes;
            break;
          case "services.*.environment":
            if (on) {
              target.environment = [...(Array.isArray(target.environment) ? target.environment : []), "KEY=value"];
            } else delete target.environment;
            break;
          case "services.*.networks":
            if (on) {
              target.networks = [...(Array.isArray(target.networks) ? target.networks : []), "default"];
            } else delete target.networks;
            break;
          case "services.*.depends_on":
            if (on) {
              target.depends_on = { db: { condition: "service_healthy" } };
            } else delete target.depends_on;
            break;
          case "services.*.healthcheck":
            if (on) {
              target.healthcheck = { test: ["CMD-SHELL", "pg_isready"], interval: "30s", timeout: "10s" };
            } else delete target.healthcheck;
            break;
          case "services.*.labels":
            if (on) {
              target.labels = { "com.example.description": "web" };
            } else delete target.labels;
            break;
          case "services.*.extra_hosts":
            if (on) {
              target.extra_hosts = ["host.docker.internal: host-gateway"];
            } else delete target.extra_hosts;
            break;
          case "services.*.dns":
            if (on) {
              target.dns = ["8.8.8.8"];
            } else delete target.dns;
            break;
          case "services.*.profiles":
            if (on) {
              target.profiles = ["debug"];
            } else delete target.profiles;
            break;
          case "services.*.platform":
            if (on) target.platform = "linux/amd64";
            else delete target.platform;
            break;
          case "services.*.tmpfs":
            if (on) {
              target.tmpfs = ["/tmp"];
            } else delete target.tmpfs;
            break;
          case "services.*.logging":
            if (on) target.logging = { driver: "json-file" };
            else delete target.logging;
            break;
          case "services.*.cap_add":
            if (on) {
              target.cap_add = [...(Array.isArray(target.cap_add) ? target.cap_add : []), "NET_ADMIN"];
            } else delete target.cap_add;
            break;
          case "services.*.cap_drop":
            if (on) {
              target.cap_drop = [...(Array.isArray(target.cap_drop) ? target.cap_drop : []), "ALL"];
            } else delete target.cap_drop;
            break;
          case "name":
            if (on) d.name = "my-stack";
            else delete d.name;
            break;
        }
      });
    },
    [withDoc],
  );

  const addService = useCallback(() => {
    withDoc((d) => {
      const names = Object.keys(d.services ?? {});
      let n = names.length + 1;
      let name = `service-${n}`;
      while (names.includes(name)) name = `service-${++n}`;
      d.services[name] = { image: "nginx:alpine" };
    });
  }, [withDoc]);

  const removeService = useCallback(
    (name: string) => {
      withDoc((d) => {
        delete d.services?.[name];
      });
    },
    [withDoc],
  );

  // ---------- Analysis actions ----------

  const runAnalyze = useCallback(() => {
    setAnalyzing(true);
    const result = analyzeYaml(yaml);
    setAnalysis(result);
    setAnalyzing(false);
  }, [yaml]);

  const runAiAnalyze = async () => {
    if (!ollama.model) {
      toast.error("Pick an Ollama model first (open the AI settings).");
      return;
    }
    setAiAnalyzing(true);
    setAiResult(null);
    const result = await ollamaClient.analyze(
      {
        yaml,
        findings: analysis?.findings ?? [],
        model: ollama.model,
        focus: aiFocus,
        maskSecrets,
      },
      (t) => {},
    );
    if ("error" in result) {
      toast.error(result.error);
      if (result.raw) toast.error(`Raw: ${result.raw.slice(0, 200)}`);
    } else {
      setAiResult(result);
      toast.success(`AI analysis: ${result.suggestions.length} suggestion(s)`);
    }
    setAiAnalyzing(false);
  };

  const acceptSuggestion = (s: AiSuggestion) => {
    setAiResult((prev) => {
      if (!prev) return prev;
      return {
        suggestions: prev.suggestions.map((x) =>
          x.id === s.id ? { ...x, accepted: true, rejected: false } : x,
        ),
      };
    });
  };

  const rejectSuggestion = (s: AiSuggestion) => {
    setAiResult((prev) => {
      if (!prev) return prev;
      return {
        suggestions: prev.suggestions.map((x) =>
          x.id === s.id ? { ...x, accepted: false, rejected: true } : x,
        ),
      };
    });
  };

  const applyAccepted = () => {
    if (!aiResult || !doc) return;
    let next = yaml;
    let applied = 0;
    for (const s of aiResult.suggestions) {
      if (!s.accepted || s.rejected) continue;
      if (!s.before || !next.includes(s.before)) continue;
      next = next.split(s.before).join(s.after);
      applied++;
    }
    if (applied > 0) {
      setYaml(next);
      toast.success(`Applied ${applied} suggestion(s)`);
      setAiResult(null);
    } else {
      toast.error("No applicable suggestions found in the current YAML.");
    }
  };

  const revertYaml = () => {
    setYaml(originalYaml);
    setAnalysis(null);
    setAiResult(null);
    toast.success("Reverted to original YAML");
  };

  // ---------- Deploy ----------

  const handleDeploy = () => {
    if (!canDeploy) {
      toast.error("Fix the errors before deploying.");
      return;
    }
    if (counts.warning > 0) {
      setDeployConfirm({
        message: `You have ${counts.warning} warning(s). Deploy anyway?`,
        onConfirm: () => doDeploy(),
      });
      return;
    }
    doDeploy();
  };

  const doDeploy = () => {
    setDeployConfirm(null);
    if (!yaml.trim()) {
      toast.error("Nothing to deploy.");
      return;
    }
    if (!docker.available) {
      toast.error("Docker engine is not reachable.");
      return;
    }
    try {
      const folder = "create-from-yaml";
      const yamlPath = `docker-yaml-files/${folder}/docker-compose.yml`;
      api.composeUpFromYaml(yamlPath, yaml).then(() => {
        toast.success("Stack deployed from YAML");
        navigate("/containers");
      });
    } catch (e: any) {
      toast.error(e.message ?? "Deploy failed");
    }
  };

  const scrollToLine = useCallback(
    (line: number) => {
      const el = editorRef.current;
      if (!el) return;
      const lines = el.value.split("\n");
      let offset = 0;
      for (let i = 0; i < Math.max(0, line - 1); i++) offset += lines[i].length + 1;
      el.setSelectionRange(offset, offset);
      el.focus();
      el.scrollTop = el.scrollHeight * (line / Math.max(1, lines.length));
    },
    [],
  );

  // ---------- Left panel rendering ----------

  const categoryOptions = useMemo(() => {
    const cats: OptionCategory[] = ["Basic", "Networking", "Storage", "Health", "Resources", "Security", "Advanced"];
    return cats;
  }, []);

  const optionHelp = (entry: OptionEntry) => {
    return (
      <div className="space-y-2 text-xs">
        <p className="font-medium">{entry.description}</p>
        <p><span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mr-1">What is it used for?</span>{entry.whenToUse}</p>
        <p><span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mr-1">If used</span>{entry.ifUsed}</p>
        <p><span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mr-1">If omitted (default)</span>{entry.ifOmitted}</p>
        <p><span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Example</span><code className="font-mono text-[10px] bg-muted p-1 rounded">{entry.example}</code></p>
        {entry.defaultValue && (
          <p><span className="font-semibold text-[10px] uppercase tracking-wider text-muted-foreground mr-1">Default</span>{entry.defaultValue}</p>
        )}
        {entry.riskLevel && entry.riskNote && (
          <p className={`text-[10px] ${entry.riskLevel === "high" ? "text-destructive" : entry.riskLevel === "medium" ? "text-amber-600" : "text-muted-foreground"}`}>
            <span className="font-semibold text-[10px] uppercase tracking-wider mr-1">Risk</span>{entry.riskNote}
          </p>
        )}
      </div>
    );
  };

  const renderOptionCard = (entry: OptionEntry) => {
    const on = presentKeys.has(entry.key);
    return (
      <Card key={entry.key} className="border p-3 mb-2 hover:border-primary/50 transition-colors group">
        <div className="flex items-center justify-between mb-1">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md shrink-0" aria-label={`Help: ${entry.label}`}>
                <IconHelpCircle className="h-4 w-4" stroke={1.5} />
              </Button>
            </PopoverTrigger>
            <PopoverContent side="right" className="w-80 text-[11px]">
              {optionHelp(entry)}
            </PopoverContent>
          </Popover>
          <Switch checked={on} onCheckedChange={(v) => toggleServiceOption(entry.key, v)} className="h-4 w-8" />
        </div>
        <div className="flex items-baseline gap-2">
          <span className="font-medium text-sm">{entry.label}</span>
          <Badge variant="secondary" className="text-[10px]">{on ? "Added" : "Add to YAML"}</Badge>
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">{entry.description}</p>
        <div className="mt-1 flex items-center gap-1">
          <span className="font-mono text-[10px] text-muted-foreground">{entry.example}</span>
        </div>
      </Card>
    );
  };

  // ---------- Deploy confirm dialog ----------

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-3 border-b pb-3">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => navigate("/containers")}>
            <span className="flex items-center gap-1">
              <IconLayout className="mr-1 h-4 w-4" stroke={1.5} />
              Containers
            </span>
          </Button>
          <span className="text-muted-foreground font-mono text-[10px]">/</span>
          <h1 className="text-xl font-semibold tracking-tight">Create from YAML</h1>
        </div>
        <div className="flex items-end gap-2">
          <Button variant="outline" size="sm" onClick={runAnalyze} disabled={analyzing || !doc}>
            <IconBug className="mr-1.5 h-3.5 w-3.5" stroke={1.5} />
            {analyzing ? "Analyzing…" : "Analyze"}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setAiOpen(true)}
            disabled={!ollama.connected}
            className={!ollama.connected ? "opacity-50" : ""}
          >
            <IconRobot className="mr-1.5 h-3.5 w-3.5" stroke={1.5} />
            AI Analyze
          </Button>
          <Button
            onClick={handleDeploy}
            disabled={!canDeploy || !docker.available}
            className="ml-2"
          >
            {docker.available ? (canDeploy ? "Deploy" : "Fix errors first") : "Docker unavailable"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowPaste(true)}>
            <IconUpload className="mr-1.5 h-3.5 w-3.5" stroke={1.5} />
            Paste / Upload
          </Button>
        </div>
      </div>

      {/* Deploy blocker banner */}
      {deployConfirm && (
        <AlertDialog open={!!deployConfirm} onOpenChange={(o) => !o && setDeployConfirm(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Confirm deploy</AlertDialogTitle>
              <AlertDialogDescription>{deployConfirm.message}</AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel onClick={() => setDeployConfirm(null)}>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={deployConfirm.onConfirm} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Deploy anyway
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      )}

      {/* Status row */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", counts.error ? "bg-red-500" : counts.warning ? "bg-amber-500" : "bg-emerald-500")} />
          {counts.error} error · {counts.warning} warning · {counts.tip} tip
        </span>
        <span className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", docker.available ? "bg-emerald-500" : "bg-slate-400")} />
          Docker: {docker.available ? "connected" : "unavailable"}
        </span>
        <span className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", ollama.connected ? "bg-emerald-500" : "bg-slate-400")} />
          Ollama: {ollama.connected ? "connected" : "unavailable"} <span className="text-[10px] opacity-70">(optional)</span>
        </span>
        {!canDeploy && counts.error > 0 && (
          <span className="text-destructive font-medium">Deploy blocked until errors are fixed</span>
        )}
      </div>

      {/* Panels */}
      <Group orientation="horizontal" className="h-[70vh] min-h-[500px] border rounded-md overflow-hidden">
        {/* LEFT: Options */}
        <Panel className="flex flex-col border-r bg-muted/30 p-0" defaultSize={26} minSize={20}>
          <div className="flex items-center justify-between border-b px-3 py-2 bg-background/50">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Options</span>
            <Button size="icon" variant="ghost" onClick={addService} className="h-6 w-6" title="Add service">
              <IconPlus className="h-3.5 w-3.5" stroke={1.5} />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-3 py-2">
              <Input placeholder="Search options…" className="h-7 text-xs" />
              <UiSeparator className="my-2" />
              <div className="flex gap-1 text-[10px] mb-1">
                {categoryOptions.map((cat) => (
                  <Button key={cat} size="sm" variant="outline" className="h-6 rounded-md px-2 text-xs font-mono">
                    {cat}
                  </Button>
                ))}
              </div>
            </div>
            <ScrollArea className="flex-1">
              <div className="p-3 space-y-1">
                {COMPOSE_REGISTRY.filter((o) => o.category === "Basic").map(renderOptionCard)}
                <UiSeparator className="my-2" />
                <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 mb-1">Advanced</div>
                {COMPOSE_REGISTRY.filter((o) => o.category !== "Basic").slice(0, 12).map(renderOptionCard)}
              </div>
            </ScrollArea>
          </div>
        </Panel>

        <UiSeparator className="bg-border" />

        {/* CENTER: YAML editor */}
        <Panel className="flex flex-col border-r bg-background p-0" defaultSize={44} minSize={30}>
          <div className="flex items-center justify-between border-b px-3 py-2 bg-background/50">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">docker-compose.yml</span>
            <div className="flex gap-1">
              <Button size="icon" variant="ghost" onClick={revertYaml} className="h-6 w-6" title="Revert to original">
                <IconHistory className="h-3.5 w-3.5" stroke={1.5} />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => {}} className="h-6 w-6" title="Format">
                <IconSettings className="h-3.5 w-3.5" stroke={1.5} />
              </Button>
            </div>
          </div>
          <div className="flex-1 relative overflow-hidden">
            <textarea
              ref={editorRef}
              value={yaml}
              onChange={(e) => setYaml(e.target.value)}
              spellCheck={false}
              className="h-full w-full font-mono text-sm leading-6 p-4 resize-none outline-none bg-transparent"
              placeholder="services:\n  web:\n    image: nginx:alpine\n    ports:\n      - '8080:80'"
            />
          </div>
          <div className="border-t px-3 py-1.5 bg-muted/50">
            <span className="text-[10px] font-mono text-muted-foreground">
              {yaml.split("\n").length} lines
              {doc ? ` · ${Object.keys(doc.services ?? {}).length} service(s)` : ""}
            </span>
          </div>
        </Panel>

        <ResizeSeparator className="bg-border" />

        {/* RIGHT: Analysis */}
        <Panel className="flex flex-col border-l bg-muted/30 p-0" defaultSize={30} minSize={22}>
          <div className="flex items-center justify-between border-b px-3 py-2 bg-background/50">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Analysis</span>
            <Button size="icon" variant="ghost" onClick={() => setView("analysis")} className="h-6 w-6" title="Details">
              <IconLayoutSidebar className="h-3.5 w-3.5" stroke={1.5} />
            </Button>
          </div>
          <div className="flex-1 overflow-hidden flex flex-col">
            <div className="px-3 py-2 border-b">
              <div className="flex gap-2">
                <Badge variant={counts.error ? "destructive" : "secondary"} className="h-7 px-2">
                  {counts.error} errors
                </Badge>
                <Badge variant={counts.warning ? "destructive" : "secondary"} className="h-7 px-2">
                  {counts.warning} warnings
                </Badge>
                <Badge variant={counts.tip ? "secondary" : "outline"} className="h-7 px-2">
                  {counts.tip} tips
                </Badge>
              </div>
            </div>
            <ScrollArea className="flex-1 p-3 space-y-3">
              {analyzing ? (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <IconLoader2 className="h-5 w-5 animate-spin" />
                  <span className="text-sm">Analyzing…</span>
                </div>
              ) : !doc ? (
                <div className="flex flex-col items-center gap-2 py-8 text-muted-foreground">
                  <IconBug className="h-5 w-5" />
                  <span className="text-sm">Enter YAML to analyze</span>
                </div>
              ) : analysis?.findings.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-8">
                  <IconCheck className="h-5 w-5 text-emerald-500" />
                  <span className="text-sm text-emerald-600 font-medium">No issues detected</span>
                </div>
              ) : (
                <div className="space-y-2">
                  {(analysis?.findings ?? []).map((f) => (
                    <FindingCard key={`${f.code}-${f.line}`} finding={f} onJump={() => scrollToLine(f.line)} />
                  ))}
                </div>
              )}
            </ScrollArea>
          </div>
        </Panel>
      </Group>

      {/* AI Analysis results (bottom or modal) */}
      {aiResult && (
        <Dialog open={aiResult.suggestions.length > 0} onOpenChange={(o) => !o && setAiResult(null)}>
          <DialogContent className="max-w-3xl">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <IconRobot className="h-4 w-4" stroke={1.5} /> AI suggestions
              </DialogTitle>
              <DialogDescription>
                Review each suggestion. Nothing is applied automatically.
              </DialogDescription>
            </DialogHeader>
            <div className="py-4 space-y-3">
              {aiResult.suggestions.map((s) => (
                <AiSuggestionCard key={s.id} suggestion={s} onAccept={() => acceptSuggestion(s)} onReject={() => rejectSuggestion(s)} />
              ))}
              <div className="flex justify-end gap-2 pt-2 border-t">
                <Button variant="ghost" size="sm" onClick={() => applyAccepted()} disabled={!aiResult.suggestions.some((s) => s.accepted && !s.rejected)}>
                  Apply accepted
                </Button>
                <Button onClick={revertYaml}>Revert all</Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* AI settings popover */}
      <Popover open={aiOpen} onOpenChange={setAiOpen}>
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm" className="ml-2">
            <span className="flex items-center gap-1">
              <IconSettings className="mr-1.5 h-3.5 w-3.5" stroke={1.5} />
              AI settings
            </span>
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-4">
          <DialogHeader className="pb-2">
            <DialogTitle className="text-base">AI (Ollama) settings</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Model</Label>
              <SelectAI models={ollama.models} value={ollama.model} onChange={(v) => setOllama((p) => ({ ...p, model: v }))} connected={ollama.connected} />
            </div>
            <div>
              <Label className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">Focus</Label>
              <SelectAIFocus value={aiFocus} onChange={setAiFocus} />
            </div>
            <div className="flex items-center gap-2">
              <Switch checked={maskSecrets} onCheckedChange={setMaskSecrets} className="h-4 w-8" />
              <Label className="text-[10px]">Mask secret values (default on)</Label>
            </div>
            <p className="text-[10px] text-muted-foreground">
              AI analysis is opt-in. Nothing is sent to Ollama unless you click <b>AI Analyze</b>.
            </p>
            {ollama.error && (
              <p className="text-[10px] text-destructive">{ollama.error}</p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {/* Paste / upload dialog */}
      <Dialog open={showPaste} onOpenChange={setShowPaste}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste or upload YAML</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 p-4">
            <Textarea value={pasteText} onChange={(e) => setPasteText(e.target.value)} rows={10} className="font-mono text-xs" placeholder="Paste docker-compose.yml here…" />
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => { setShowPaste(false); setPasteText(""); }}>Cancel</Button>
              <Button onClick={() => { setYaml(pasteText || DEFAULT_YAML); setOriginalYaml(pasteText || DEFAULT_YAML); setShowPaste(false); setPasteText(""); }}>Load</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function FindingCard({ finding, onJump }: { finding: Finding; onJump: () => void }) {
  const variant = finding.severity === "error" ? "destructive" : finding.severity === "warning" ? "outline" : "secondary";
  return (
    <Card className="border p-2 cursor-pointer hover:bg-accent transition-colors" onClick={onJump}>
      <div className="flex items-start gap-2">
        <Badge variant={variant} className="text-[10px] shrink-0">{finding.severity.toUpperCase()}</Badge>
        <div className="flex-1 min-w-0">
          <div className="font-mono text-xs text-foreground truncate">{finding.message}</div>
          <div className="flex items-center gap-1 mt-0.5">
            {finding.service && (
              <span className="font-mono text-[10px] text-muted-foreground">{finding.service}</span>
            )}
            <span className="font-mono text-[10px] text-muted-foreground">line {finding.line}</span>
            {finding.suggestedFix && (
              <span className="ml-auto font-mono text-[10px] text-primary cursor-pointer underline underline-offset-4">Apply fix</span>
            )}
          </div>
        </div>
      </div>
    </Card>
  );
}

function AiSuggestionCard({ suggestion, onAccept, onReject }: { suggestion: AiSuggestion; onAccept: (s: AiSuggestion) => void; onReject: (s: AiSuggestion) => void }) {
  const status = suggestion.accepted ? "accepted" : suggestion.rejected ? "rejected" : "pending";
  return (
    <Card className="border p-3 mb-2">
      <div className="flex items-start gap-2 mb-1">
        <span className={`font-mono text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded ${status === "accepted" ? "bg-emerald-100 text-emerald-700" : status === "rejected" ? "bg-slate-100 text-slate-500" : "bg-primary/10 text-primary"}`}>{status}</span>
        <Badge variant="secondary" className="ml-auto text-[10px]">Confidence {suggestion.confidence}%</Badge>
      </div>
      <div className="text-sm text-muted-foreground mb-2">{suggestion.what}</div>
      <div className="text-[10px] text-muted-foreground mb-2">{suggestion.why}</div>
      <div className="grid gap-2 mb-2 text-[10px] font-mono">
        <div>
          <span className="text-muted-foreground/60">Before</span>
          <div className="bg-[#0b0f19] text-[#e2e8f0] p-1 rounded text-[9px]">{suggestion.before}</div>
        </div>
        <div>
          <span className="text-muted-foreground/60">After</span>
          <div className="bg-emerald-500/10 text-emerald-900 p-1 rounded text-[9px]">{suggestion.after}</div>
        </div>
      </div>
      <div className="flex gap-2">
        {!suggestion.accepted && !suggestion.rejected && (
          <>
            <Button size="sm" onClick={() => onAccept(suggestion)}>Accept</Button>
            <Button size="sm" variant="outline" onClick={() => onReject(suggestion)}>Reject</Button>
          </>
        )}
        {suggestion.accepted && <span className="text-xs text-emerald-600 font-medium">Accepted</span>}
        {suggestion.rejected && <span className="text-xs text-slate-500 font-medium">Rejected</span>}
      </div>
    </Card>
  );
}

function SelectAI({ models, value, onChange, connected }: { models: string[]; value: string; onChange: (v: string) => void; connected: boolean }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={!connected} className="w-full h-7 rounded-md border bg-background px-2 text-xs font-mono">
      {models.map((m) => (m ? <option key={m} value={m}>{m}</option> : null))}
      {models.length === 0 && <option disabled>No models</option>}
    </select>
  );
}

function SelectAIFocus({ value, onChange }: { value: AIFocus; onChange: (v: AIFocus) => void }) {
  const opts: AIFocus[] = ["Improve options", "Naming conventions", "Security", "Performance", "All"];
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as AIFocus)} className="w-full h-7 rounded-md border bg-background px-2 text-xs font-mono">
      {opts.map((o) => <option key={o} value={o}>{o}</option>)}
    </select>
  );
}
