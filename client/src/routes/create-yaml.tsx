import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { IconBug, IconCheck, IconCopy, IconDownload, IconHistory, IconLayout, IconLoader2, IconUpload, IconX } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import { cn } from "@/lib/utils";
import * as jsYaml from "js-yaml";
import { Textarea } from "@/components/ui/textarea";
import { analyzeYaml, type Finding, type AnalyzeResult } from "@/lib/compose-analyzer";
import { api } from "@/lib/api";

const DEFAULT_YAML = `services:
  web:
    image: nginx:alpine
    container_name: my-web
    ports:
      - "8080:80"
    restart: unless-stopped
`;

export default function CreateYamlPage() {
  const [yaml, setYaml] = useState(DEFAULT_YAML);
  const [originalYaml, setOriginalYaml] = useState(DEFAULT_YAML);
  const [analysis, setAnalysis] = useState<AnalyzeResult | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [deployConfirm, setDeployConfirm] = useState<{ message: string; onConfirm: () => void } | null>(null);
  const editorRef = useRef<HTMLTextAreaElement>(null);
  const navigate = useNavigate();

  const doc = useMemo<any | null>(() => {
    if (!yaml.trim()) return null;
    try {
      const d = jsYaml.load(yaml);
      return typeof d === "object" && !Array.isArray(d) && d ? d : null;
    } catch {
      return null;
    }
  }, [yaml]);

  // Run built-in analysis whenever YAML changes.
  useEffect(() => {
    if (!doc) {
      setAnalysis(null);
      return;
    }
    setAnalyzing(true);
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

  const canDeploy = counts.error === 0 && Boolean(doc);

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

  const revertYaml = () => {
    setYaml(originalYaml);
    setAnalysis(null);
    toast.success("Reverted to original YAML");
  };

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
          <Button variant="outline" size="sm" onClick={() => setShowPaste(true)}>
            <IconUpload className="mr-1.5 h-3.5 w-3.5" stroke={1.5} />
            Paste YAML
          </Button>
          <Button
            onClick={handleDeploy}
            disabled={!canDeploy}
            className="ml-2"
          >
            {canDeploy ? "Deploy" : "Fix errors first"}
          </Button>
        </div>
      </div>

      {/* Deploy confirm */}
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

      {/* Analysis summary */}
      <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className={cn("h-2 w-2 rounded-full", counts.error ? "bg-red-500" : counts.warning ? "bg-amber-500" : "bg-emerald-500")} />
          {counts.error} error · {counts.warning} warning · {counts.tip} tip
        </span>
        {!canDeploy && counts.error > 0 && (
          <span className="text-destructive font-medium">Deploy blocked until errors are fixed</span>
        )}
      </div>

      {/* YAML Editor */}
      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b px-3 py-2 bg-background/50">
          <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">
            docker-compose.yml
          </span>
          <div className="flex gap-1">
            <Button size="icon" variant="ghost" onClick={revertYaml} className="h-6 w-6" title="Revert to original">
              <IconHistory className="h-3.5 w-3.5" stroke={1.5} />
            </Button>
          </div>
        </div>
        <div className="flex-1 relative overflow-hidden">
          <textarea
            ref={editorRef}
            value={yaml}
            onChange={(e) => setYaml(e.target.value)}
            spellCheck={false}
            className="h-[60vh] w-full font-mono text-sm leading-6 p-4 resize-none outline-none bg-transparent"
            placeholder="services:\n  web:\n    image: nginx:alpine\n    ports:\n      - '8080:80'"
          />
        </div>
        <div className="border-t px-3 py-1.5 bg-muted/50">
          <span className="text-[10px] font-mono text-muted-foreground">
            {yaml.split("\n").length} lines
            {doc ? ` · ${Object.keys(doc.services ?? {}).length} service(s)` : ""}
          </span>
        </div>
      </Card>

      {/* Analysis findings */}
      {analyzing ? (
        <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
          <IconLoader2 className="h-5 w-5 animate-spin" />
          <span className="text-sm">Analyzing…</span>
        </div>
      ) : !doc ? (
        <div className="py-8 text-center text-sm text-muted-foreground">
          <IconBug className="h-5 w-5" />
          <p>Enter YAML to analyze</p>
        </div>
      ) : analysis?.findings.length === 0 ? (
        <div className="flex items-center justify-center gap-2 py-8">
          <IconCheck className="h-5 w-5 text-emerald-500" />
          <span className="text-sm text-emerald-600 font-medium">No issues detected</span>
        </div>
      ) : (
        <Card>
          <div className="border-b px-3 py-2 bg-background/50">
            <span className="font-mono text-[10px] uppercase tracking-widest text-muted-foreground">Analysis</span>
          </div>
          <ScrollArea className="h-[40vh] p-3 space-y-2">
            {(analysis?.findings ?? []).map((f) => (
              <FindingCard key={`${f.code}-${f.line}`} finding={f} onJump={() => scrollToLine(f.line)} />
            ))}
          </ScrollArea>
        </Card>
      )}

      {/* Paste dialog */}
      <Dialog open={showPaste} onOpenChange={setShowPaste}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste YAML</DialogTitle>
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
