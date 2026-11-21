import { useState, useRef, useEffect } from "react";
import {
  IconTerminal,
  IconCopy,
  IconTrash,
  IconPlayerPlay,
  IconArrowsMaximize,
  IconArrowsMinimize,
  IconX,
  IconCheck,
} from "@tabler/icons-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface CommandHistoryItem {
  command: string;
  stdout: string;
  stderr: string;
  code: number;
  time: string;
}

const PRESET_COMMANDS = [
  { label: "compose up", cmd: "docker compose up -d" },
  { label: "compose down", cmd: "docker compose down" },
  { label: "compose ps", cmd: "docker compose ps" },
  { label: "compose logs", cmd: "docker compose logs --tail 50" },
  { label: "compose restart", cmd: "docker compose restart" },
  { label: "compose config", cmd: "docker compose config" },
  { label: "docker ps", cmd: "docker ps -a" },
  { label: "list files", cmd: "ls -la" },
];

export function FolderTerminalDialog({
  open,
  onOpenChange,
  cwd,
  title,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  cwd: string;
  title?: string;
}) {
  const [command, setCommand] = useState("");
  const [running, setRunning] = useState(false);
  const [history, setHistory] = useState<CommandHistoryItem[]>([]);
  const [commandHistoryIndex, setCommandHistoryIndex] = useState<number>(-1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [copied, setCopied] = useState(false);

  const outputEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Auto scroll to bottom of output on new entries
  useEffect(() => {
    outputEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history, running]);

  // Focus input when dialog opens
  useEffect(() => {
    if (open) {
      setTimeout(() => inputRef.current?.focus(), 100);
    }
  }, [open]);

  const executeCommand = async (cmdToRun: string) => {
    const trimmed = cmdToRun.trim();
    if (!trimmed || running) return;

    setRunning(true);
    setCommand("");
    setCommandHistoryIndex(-1);

    const time = new Date().toLocaleTimeString();

    try {
      const res = await api.runTerminalCommand(cwd, trimmed);
      setHistory((prev) => [
        ...prev,
        {
          command: trimmed,
          stdout: res.stdout || "",
          stderr: res.stderr || "",
          code: res.code ?? 0,
          time,
        },
      ]);
    } catch (err: any) {
      setHistory((prev) => [
        ...prev,
        {
          command: trimmed,
          stdout: "",
          stderr: err.message || "Execution error",
          code: 1,
          time,
        },
      ]);
      toast.error(err.message || "Failed to execute command");
    } finally {
      setRunning(false);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      executeCommand(command);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      const pastCommands = history.map((h) => h.command);
      if (pastCommands.length === 0) return;
      const nextIndex =
        commandHistoryIndex === -1
          ? pastCommands.length - 1
          : Math.max(0, commandHistoryIndex - 1);
      setCommandHistoryIndex(nextIndex);
      setCommand(pastCommands[nextIndex]);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      const pastCommands = history.map((h) => h.command);
      if (commandHistoryIndex === -1) return;
      const nextIndex = commandHistoryIndex + 1;
      if (nextIndex >= pastCommands.length) {
        setCommandHistoryIndex(-1);
        setCommand("");
      } else {
        setCommandHistoryIndex(nextIndex);
        setCommand(pastCommands[nextIndex]);
      }
    }
  };

  const handleCopy = () => {
    const text = history
      .map(
        (h) =>
          `$ ${h.command}\n${h.stdout ? h.stdout + "\n" : ""}${h.stderr ? "[stderr] " + h.stderr + "\n" : ""}`,
      )
      .join("\n");
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
    toast.success("Terminal output copied");
  };

  const handleClear = () => {
    setHistory([]);
    toast.info("Terminal output cleared");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className={cn(
          "flex flex-col gap-0 p-0 overflow-hidden bg-background border transition-all duration-200",
          isFullscreen
            ? "fixed inset-2 w-[calc(100vw-1rem)] h-[calc(100vh-1rem)] max-w-none rounded-xl"
            : "max-w-4xl h-[78vh] rounded-xl shadow-2xl",
        )}
      >
        {/* Terminal Header */}
        <DialogHeader className="flex flex-row items-center justify-between border-b px-4 py-2.5 bg-muted/40 shrink-0">
          <div className="flex items-center gap-2">
            <div className="grid h-7 w-7 place-items-center rounded-md bg-foreground/5 text-foreground">
              <IconTerminal className="h-4 w-4" stroke={1.75} />
            </div>
            <div>
              <DialogTitle className="text-sm font-semibold tracking-tight flex items-center gap-2">
                <span>{title || "Folder Terminal"}</span>
                <span className="font-mono text-[10px] font-normal px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
                  docker shell
                </span>
              </DialogTitle>
              <div className="font-mono text-[11px] text-muted-foreground truncate max-w-md">
                cwd: {cwd || "."}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleCopy}
              disabled={history.length === 0}
              title="Copy terminal session"
            >
              {copied ? <IconCheck className="h-3.5 w-3.5" /> : <IconCopy className="h-3.5 w-3.5" />}
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={handleClear}
              disabled={history.length === 0}
              title="Clear terminal"
            >
              <IconTrash className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              onClick={() => setIsFullscreen(!isFullscreen)}
              title={isFullscreen ? "Exit fullscreen" : "Maximize terminal"}
            >
              {isFullscreen ? (
                <IconArrowsMinimize className="h-3.5 w-3.5" />
              ) : (
                <IconArrowsMaximize className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </DialogHeader>

        {/* Preset quick command shortcuts */}
        <div className="flex items-center gap-1.5 overflow-x-auto border-b bg-muted/20 px-4 py-1.5 shrink-0 scrollbar-none">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground shrink-0 mr-1">
            quick actions:
          </span>
          {PRESET_COMMANDS.map((p) => (
            <button
              key={p.cmd}
              onClick={() => executeCommand(p.cmd)}
              disabled={running}
              className="inline-flex items-center gap-1 rounded-md border border-border/60 bg-background/80 px-2 py-0.5 font-mono text-[11px] text-muted-foreground hover:border-foreground/40 hover:text-foreground transition-colors disabled:opacity-50 shrink-0"
            >
              <IconPlayerPlay className="h-2.5 w-2.5" />
              <span>{p.label}</span>
            </button>
          ))}
        </div>

        {/* Terminal Output Area */}
        <div className="flex-1 overflow-y-auto overscroll-contain p-4 font-mono text-xs bg-zinc-950 text-zinc-100 select-text">
          {history.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-zinc-500 py-12 space-y-2 text-center">
              <IconTerminal className="h-8 w-8 text-zinc-600" stroke={1.5} />
              <div>Terminal ready in folder <code className="text-zinc-400 bg-zinc-900 px-1.5 py-0.5 rounded">{cwd}</code></div>
              <p className="text-[11px] text-zinc-600 max-w-sm">
                Type any command below (e.g. <code>docker compose up -d</code>, <code>docker ps</code>) or click a quick action above.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {history.map((item, idx) => (
                <div key={idx} className="space-y-1">
                  <div className="flex items-center justify-between text-[11px] text-zinc-500 border-b border-zinc-800 pb-0.5">
                    <span className="flex items-center gap-1 text-emerald-400">
                      <span className="text-zinc-500">$</span> {item.command}
                    </span>
                    <span className="flex items-center gap-2">
                      <span
                        className={cn(
                          "px-1.5 py-0.2 rounded text-[10px]",
                          item.code === 0 ? "text-emerald-400" : "text-red-400",
                        )}
                      >
                        exit: {item.code}
                      </span>
                      <span>{item.time}</span>
                    </span>
                  </div>
                  {item.stdout && (
                    <pre className="whitespace-pre-wrap break-all text-zinc-300 font-mono text-[11px] leading-relaxed">
                      {item.stdout}
                    </pre>
                  )}
                  {item.stderr && (
                    <pre className="whitespace-pre-wrap break-all text-amber-400 font-mono text-[11px] leading-relaxed">
                      {item.stderr}
                    </pre>
                  )}
                </div>
              ))}
              {running && (
                <div className="flex items-center gap-2 text-zinc-400 py-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="italic text-[11px]">Executing command…</span>
                </div>
              )}
              <div ref={outputEndRef} />
            </div>
          )}
        </div>

        {/* Terminal Input Bar */}
        <div className="border-t border-border bg-muted/40 p-2.5 shrink-0">
          <div className="flex items-center gap-2 rounded-lg border bg-background px-3 py-1.5 focus-within:ring-2 focus-within:ring-ring focus-within:border-ring">
            <span className="font-mono text-xs font-semibold text-emerald-500">$</span>
            <input
              ref={inputRef}
              type="text"
              value={command}
              onChange={(e) => setCommand(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={running}
              placeholder={running ? "Executing command…" : "Type a docker command or shell command and press Enter…"}
              className="flex-1 bg-transparent font-mono text-xs outline-none placeholder:text-muted-foreground/60 text-foreground"
            />
            <Button
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => executeCommand(command)}
              disabled={!command.trim() || running}
            >
              {running ? "Running…" : "Run"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
