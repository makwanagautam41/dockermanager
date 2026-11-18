import {
  Component,
  StrictMode,
  useEffect,
  useState,
  type ErrorInfo,
  type ReactNode,
} from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/sonner";
import { ThemeProvider } from "@/lib/theme-provider";
import { WorkspaceProvider, getStoredToken } from "@/lib/workspace-store";
import { reportLovableError } from "@/lib/lovable-error-reporting";
import "./index.css";

import Index from "./routes/index";
import OnboardingRoute from "./routes/onboarding";
import AppLayout from "./routes/app-layout";
import ContainersPage from "./routes/containers";
import ImagesPage from "./routes/images";
import VolumesPage from "./routes/volumes";
import RegistryPage from "./routes/registry";
import YamlPage from "./routes/yaml";
import SetupPage from "./routes/setup";
import StacksRedirect from "./routes/redirect-stacks";
import StackDetail from "./routes/stack-detail";

const STORAGE_KEY = "dockermanager-state-v2";

function getApiBase(): string {
  const configured =
    (typeof import.meta !== "undefined" && import.meta.env?.VITE_API_URL) ||
    (typeof process !== "undefined" && process.env.API_URL);
  if (configured) return configured.replace(/\/$/, "");
  if (typeof window !== "undefined") return "/api";
  const backendOrigin =
    (typeof import.meta !== "undefined" &&
      (import.meta.env as any)?.VITE_DOCKERMANAGER_BACKEND_ORIGIN) ||
    "http://127.0.0.1:22443";
  return `${backendOrigin.replace(/\/$/, "")}/api`;
}

async function fetchWorkspaces(): Promise<{ id: string; name: string; color: string }[]> {
  const token = getStoredToken();
  const res = await fetch(`${getApiBase()}/workspaces`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return [];
  const data = await res.json();
  return data.map((w: any) => ({ id: w.id, name: w.name, color: w.color || "#6366f1" }));
}

function switchWorkspace(id: string) {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const p = JSON.parse(raw);
      p.currentId = id;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
    }
  } catch {}
  window.location.href = "/";
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

class ErrorBoundary extends Component<
  { children: ReactNode },
  { error: Error | null }
> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info);
    reportLovableError(error, { boundary: "react_error_boundary" });
  }

  render() {
    if (!this.state.error) return this.props.children;
    return <ErrorComponent error={this.state.error} onReset={() => this.setState({ error: null })} />;
  }
}

function ErrorComponent({ error, onReset }: { error: Error; onReset: () => void }) {
  const [workspaces, setWorkspaces] = useState<{ id: string; name: string; color: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchWorkspaces().then((ws) => {
      setWorkspaces(ws);
      setLoading(false);
    });
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md w-full text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          Something went wrong
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {error.message || "An unexpected error occurred while loading this page."}
        </p>
        {!loading && workspaces.length > 1 && (
          <div className="mt-6 text-left">
            <p className="text-xs font-medium text-muted-foreground mb-2">
              Switch to another workspace:
            </p>
            <div className="space-y-1">
              {workspaces.map((w) => (
                <button
                  key={w.id}
                  onClick={() => switchWorkspace(w.id)}
                  className="w-full flex items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-accent"
                >
                  <span
                    className="h-3 w-3 rounded-full shrink-0"
                    style={{ backgroundColor: w.color }}
                  />
                  <span className="truncate">{w.name}</span>
                </button>
              ))}
            </div>
          </div>
        )}
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={onReset}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
          {!loading && workspaces.length > 1 && (
            <button
              onClick={() => {
                localStorage.removeItem(STORAGE_KEY);
                window.location.href = "/onboarding";
              }}
              className="inline-flex items-center justify-center rounded-md border border-destructive/50 bg-background px-4 py-2 text-sm font-medium text-destructive transition-colors hover:bg-destructive/10"
            >
              Reset workspace state
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <ThemeProvider>
          <WorkspaceProvider>
            <BrowserRouter>
              <Routes>
                <Route path="/" element={<Index />} />
                <Route path="/onboarding" element={<OnboardingRoute />} />
                <Route element={<AppLayout />}>
                  <Route path="/containers" element={<ContainersPage />} />
                  <Route path="/images" element={<ImagesPage />} />
                  <Route path="/volumes" element={<VolumesPage />} />
                  <Route path="/registry" element={<RegistryPage />} />
                  <Route path="/yaml" element={<YamlPage />} />
                  <Route path="/setup" element={<SetupPage />} />
                  <Route path="/stacks" element={<StacksRedirect />} />
                  <Route path="/stacks/:stackId" element={<StackDetail />} />
                </Route>
                <Route path="*" element={<NotFoundComponent />} />
              </Routes>
            </BrowserRouter>
            <Toaster richColors position="top-right" />
          </WorkspaceProvider>
        </ThemeProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
);
