import { Outlet, useNavigate } from "react-router-dom";
import { useCallback, useEffect, useState } from "react";
import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopBar } from "@/components/top-bar";
import { StatusBar } from "@/components/status-bar";
import { ShortcutsDialog } from "@/components/shortcuts-dialog";
import { FullPageLoader } from "@/components/loader";
import { ServerDownPage } from "@/components/server-down";
import { HealthStatusProvider, healthGate } from "@/lib/health";
import { useWorkspaces } from "@/lib/workspace-store";
import { api } from "@/lib/api";

export default function AppLayout() {
  const { hydrated, workspaces, current, error, refresh, loading } = useWorkspaces();
  const navigate = useNavigate();
  const [dismissedError, setDismissedError] = useState(false);
  const [serverUp, setServerUp] = useState<boolean | null>(null);
  const [checking, setChecking] = useState(false);

  const checkServer = useCallback(async () => {
    setChecking(true);
    try {
      await api.health();
      healthGate.set("dockerEngine", "ok");
      setServerUp(true);
    } catch {
      healthGate.set("dockerEngine", "failed", "Docker engine is not reachable");
      setServerUp(false);
    }
    try {
      const status = await api.ollamaStatus();
      healthGate.set(
        "ollamaReachable",
        status.connected ? "ok" : "failed",
        status.error || "Ollama is not reachable",
      );
    } catch {
      healthGate.set("ollamaReachable", "failed", "Ollama is not reachable");
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    checkServer();
    const t = setInterval(checkServer, 5000);
    return () => clearInterval(t);
  }, [checkServer]);

  useEffect(() => {
    if (hydrated && workspaces.length === 0) navigate("/onboarding");
  }, [hydrated, workspaces.length, navigate]);

  if (serverUp === false) {
    return <ServerDownPage onRetry={checkServer} checking={checking} />;
  }

  if (!hydrated) {
    return (
      <div className="grid min-h-screen w-full place-items-center bg-background">
        <FullPageLoader label="restoring workspace…" />
      </div>
    );
  }
  if (workspaces.length === 0) return null;

  return (
    <HealthStatusProvider>
      <SidebarProvider>
        <div className="flex min-h-screen w-full">
          <AppSidebar />
          <SidebarInset className="flex min-w-0 flex-1 flex-col">
            <TopBar />
            {error && !dismissedError && (
              <div className="border-b border-red-500/20 bg-red-500/5 px-4 py-2 text-sm flex items-center gap-3">
                <span className="text-red-600 dark:text-red-400 flex-1">
                  {error}
                </span>
                <button
                  onClick={() => refresh()}
                  className="text-xs font-medium text-red-600 dark:text-red-400 hover:underline shrink-0"
                >
                  Retry
                </button>
                <button
                  onClick={() => setDismissedError(true)}
                  className="text-xs text-muted-foreground hover:text-foreground shrink-0"
                >
                  Dismiss
                </button>
              </div>
            )}
            <main className="flex min-w-0 flex-1 flex-col p-4 sm:p-6">
              {loading && !current ? <FullPageLoader label="loading…" /> : <Outlet />}
            </main>
            <StatusBar />
          </SidebarInset>
        </div>
        <ShortcutsDialog />
      </SidebarProvider>
    </HealthStatusProvider>
  );
}
