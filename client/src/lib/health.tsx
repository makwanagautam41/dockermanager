import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";

export type FeatureStatus = "ok" | "loading" | "degraded" | "failed";

/**
 * Each feature declares what it requires. If a dependency is `failed`, every
 * dependent is disabled with a visible reason while independent features keep
 * working (changes.md section 6).
 */
export const FEATURE_GRAPH: Record<string, string[]> = {
  dockerEngine: [],
  ollamaReachable: [],
  // Containers
  containerList: ["dockerEngine"],
  containerFilters: ["containerList"],
  // Networks
  networkView: ["dockerEngine", "containerList"],
  // YAML
  yamlParsed: [],
  yamlValidation: ["yamlParsed"],
  yamlLiveChecks: ["dockerEngine"],
  yamlDeploy: ["yamlValidation", "dockerEngine"],
  // AI (Ollama) analysis — opt-in, user-controlled
  aiAnalysis: ["ollamaReachable", "yamlParsed"],
};

export type FeatureName = keyof typeof FEATURE_GRAPH;

interface Node {
  own: FeatureStatus;
  reason?: string;
  updatedAt: number;
}

const now = () => Date.now();

export class HealthGate {
  private graph: Record<string, string[]>;
  private nodes: Map<string, Node> = new Map();
  private listeners: Set<(snapshot: ReadonlyMap<string, FeatureStatus>) => void> = new Set();

  constructor(graph: Record<string, string[]> = FEATURE_GRAPH) {
    this.graph = graph;
    for (const feature of Object.keys(graph)) {
      this.nodes.set(feature, { own: "loading", updatedAt: now() });
    }
  }

  /** Snapshot of *effective* statuses (own status combined with dependencies). */
  snapshot(): ReadonlyMap<string, FeatureStatus> {
    const out = new Map<string, FeatureStatus>();
    for (const feature of this.nodes.keys()) {
      out.set(feature, this.effective(feature));
    }
    return out;
  }

  /** Own status of a single feature (as reported by a health check). */
  own(feature: FeatureName): FeatureStatus {
    return this.nodes.get(feature)?.own ?? "loading";
  }

  /** Effective status: own status combined with dependency statuses. */
  effective(feature: FeatureName): FeatureStatus {
    const node = this.nodes.get(feature);
    if (!node) return "loading";
    if (node.own === "failed") return "failed";

    let worst: FeatureStatus = node.own;
    let reason: string | undefined;
    for (const dep of this.graph[feature] ?? []) {
      const d = this.effective(dep);
      if (d === "failed") {
        return "failed";
      }
      if (d === "degraded") {
        worst = "degraded";
      }
      if (d === "loading" && worst === "ok") {
        worst = "degraded";
      }
    }
    return worst;
  }

  /** Human reason why a feature is unavailable (failed or degraded). */
  reasonFor(feature: FeatureName): string | undefined {
    const node = this.nodes.get(feature);
    if (!node) return undefined;
    if (node.reason) return node.reason;
    for (const dep of this.graph[feature] ?? []) {
      const depNode = this.nodes.get(dep);
      if (depNode?.own === "failed" && depNode.reason) {
        return `Unavailable: ${dep} is not reachable (${depNode.reason})`;
      }
      if (depNode?.own === "failed") {
        return `Unavailable: ${dep} is not reachable`;
      }
    }
    return undefined;
  }

  /** True when the feature and all its dependencies are healthy. */
  isAvailable(feature: FeatureName): boolean {
    return this.effective(feature) === "ok";
  }

  /** Report the result of a health check for a feature. */
  set(feature: FeatureName, status: FeatureStatus, reason?: string) {
    this.nodes.set(feature, { own: status, reason, updatedAt: now() });
    const snapshot = this.snapshot();
    this.listeners.forEach((fn) => fn(snapshot));
  }

  subscribe(listener: (snapshot: ReadonlyMap<string, FeatureStatus>) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}

export const healthGate = new HealthGate();

const HealthCtx = createContext<HealthGate | null>(null);

export function HealthStatusProvider({ children }: { children: ReactNode }) {
  const Provider = HealthCtx.Provider;
  return <Provider value={healthGate}>{children}</Provider>;
}

export function useHealth(feature: FeatureName) {
  const gate = useContext(HealthCtx);
  const [status, setStatus] = useState<FeatureStatus>(gate ? gate.effective(feature) : "loading");

  useEffect(() => {
    if (!gate) return;
    setStatus(gate.effective(feature));
    const unsub = gate.subscribe(() => setStatus(gate.effective(feature)));
    return unsub;
  }, [gate, feature]);

  const available = useCallback(() => gate ? gate.isAvailable(feature) : false, [gate, feature]);
  const reason = useCallback(() => gate ? gate.reasonFor(feature) : undefined, [gate, feature]);

  return { status, available: available(), reason, gate };
}
