import {
  IconAlertTriangle,
  IconArchive,
  IconBell,
  IconDownload,
  IconInfoCircle,
  IconPencil,
  IconPlayerPlay,
  IconPlus,
  IconRefresh,
  IconRestore,
  IconSquare,
  IconTrash,
  IconX,
} from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
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
import { ScrollArea } from "@/components/ui/scroll-area";
import { useWorkspaces } from "@/lib/workspace-store";
import type { ActivityEvent } from "@/lib/types";
import { cn } from "@/lib/utils";

type Severity = "success" | "warning" | "error" | "info" | "neutral";

const KIND_META: Record<string, { severity: Severity; label: string; Icon: typeof IconBell }> = {
  start: { severity: "success", label: "Started", Icon: IconPlayerPlay },
  stop: { severity: "warning", label: "Stopped", Icon: IconSquare },
  restart: { severity: "info", label: "Restarted", Icon: IconRefresh },
  create: { severity: "success", label: "Created", Icon: IconPlus },
  delete: { severity: "error", label: "Deleted", Icon: IconTrash },
  edit: { severity: "info", label: "Edited", Icon: IconPencil },
  error: { severity: "error", label: "Error", Icon: IconAlertTriangle },
  alert: { severity: "warning", label: "Alert", Icon: IconBell },
  pull: { severity: "success", label: "Pulled", Icon: IconDownload },
  backup: { severity: "info", label: "Backup", Icon: IconArchive },
  restore: { severity: "success", label: "Restored", Icon: IconRestore },
  success: { severity: "success", label: "Success", Icon: IconInfoCircle },
  info: { severity: "info", label: "Info", Icon: IconInfoCircle },
};

const SEVERITY_STYLES: Record<Severity, { dot: string; text: string; badge: string }> = {
  success: {
    dot: "bg-emerald-500",
    text: "text-emerald-600 dark:text-emerald-400",
    badge: "text-emerald-600 dark:text-emerald-400 border-emerald-500/30 bg-emerald-500/5",
  },
  warning: {
    dot: "bg-amber-500",
    text: "text-amber-600 dark:text-amber-400",
    badge: "text-amber-600 dark:text-amber-400 border-amber-500/30 bg-amber-500/5",
  },
  error: {
    dot: "bg-red-500",
    text: "text-red-600 dark:text-red-400",
    badge: "text-red-600 dark:text-red-400 border-red-500/30 bg-red-500/5",
  },
  info: {
    dot: "bg-sky-500",
    text: "text-sky-600 dark:text-sky-400",
    badge: "text-sky-600 dark:text-sky-400 border-sky-500/30 bg-sky-500/5",
  },
  neutral: {
    dot: "bg-slate-400",
    text: "text-slate-500 dark:text-slate-400",
    badge: "text-slate-500 border-border",
  },
};

function kindMeta(kind: string) {
  return KIND_META[kind] ?? { severity: "neutral" as Severity, label: kind, Icon: IconInfoCircle };
}

export function severityStylesFor(kind: string): { dot: string; text: string } {
  const { severity } = kindMeta(kind);
  const style = SEVERITY_STYLES[severity];
  return { dot: style.dot, text: style.text };
}

export function relativeTime(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const s = Math.floor(diff / 1000);
  if (diff < 0 || s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d ago`;
  return new Date(ts).toLocaleDateString();
}

export function ActivityDrawer() {
  const { current, activityByWs, clearActivity } = useWorkspaces();
  const [clearOpen, setClearOpen] = useState(false);
  const events = current ? (activityByWs[current.id] ?? []).slice(0, 100) : [];

  const counts = events.reduce<Record<Severity, number>>(
    (acc, e) => {
      const { severity } = kindMeta(e.kind);
      acc[severity] += 1;
      return acc;
    },
    { success: 0, warning: 0, error: 0, info: 0, neutral: 0 },
  );

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-md"
          aria-label="Activity"
        >
          <IconBell className="h-4 w-4" stroke={1.75} />
          {events.length > 0 && (
            <span className="absolute right-1.5 top-1.5 grid h-4 min-w-4 place-items-center rounded-full bg-primary px-1 text-[9px] font-semibold text-primary-foreground">
              {counts.error + counts.warning}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle className="font-mono">Activity</SheetTitle>
          <SheetDescription>Recent events in this workspace</SheetDescription>
        </SheetHeader>

        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Badge className={cn("border", SEVERITY_STYLES.success.badge)}>
            {counts.success} success
          </Badge>
          <Badge className={cn("border", SEVERITY_STYLES.warning.badge)}>
            {counts.warning} warning
          </Badge>
          <Badge className={cn("border", SEVERITY_STYLES.error.badge)}>
            {counts.error} error
          </Badge>
          <Badge className={cn("border", SEVERITY_STYLES.info.badge)}>
            {counts.info} info
          </Badge>
          {events.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="ml-auto h-7 gap-1 text-xs text-muted-foreground"
              onClick={() => setClearOpen(true)}
            >
              <IconX className="h-3.5 w-3.5" stroke={1.75} /> Clear all
            </Button>
          )}
        </div>

        <ScrollArea className="mt-4 h-[calc(100vh-13rem)] pr-2">
          {events.length === 0 ? (
            <div className="grid place-items-center py-16 text-center">
              <IconBell className="mb-2 h-6 w-6 text-muted-foreground/40" stroke={1.5} />
              <p className="text-sm text-muted-foreground">
                No activity yet. Actions like container start / stop / create will show up here.
              </p>
            </div>
          ) : (
            <ul className="space-y-1">
              {events.map((e: ActivityEvent) => {
                const { severity, label, Icon } = kindMeta(e.kind);
                const style = SEVERITY_STYLES[severity];
                return (
                  <li
                    key={e.id}
                    className="flex items-start gap-3 rounded-md border border-transparent px-2 py-2 hover:border-border hover:bg-accent/40"
                  >
                    <span className={cn("mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-full border", style.badge)}>
                      <Icon className="h-3.5 w-3.5" stroke={1.75} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className={cn("text-sm", style.text)}>{e.message}</div>
                      <div className="font-mono text-[11px] text-muted-foreground">
                        {formatTimestamp(e)}
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("font-mono text-[10px] uppercase", style.badge)}>
                      {label}
                    </Badge>
                  </li>
                );
              })}
            </ul>
          )}
        </ScrollArea>

        <AlertDialog open={clearOpen} onOpenChange={setClearOpen}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Clear all activity?</AlertDialogTitle>
              <AlertDialogDescription>
                This removes the shown activity history for the current workspace. This can't be
                undone.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                onClick={() => {
                  if (current) clearActivity(current.id);
                  setClearOpen(false);
                }}
              >
                Clear activity
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  );
}

function formatTimestamp(e: ActivityEvent) {
  return `${relativeTime(e.ts)} · ${new Date(e.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
}