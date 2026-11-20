import * as yaml from "js-yaml";
import type { DockerContainer } from "@/routes/containers";

export type FindingSeverity = "error" | "warning" | "tip";

export interface Finding {
  severity: FindingSeverity;
  code: string;
  message: string;
  line: number; // 1-based source line
  service?: string;
  suggestedFix?: string;
  fixable?: boolean;
}

export interface ServiceSummary {
  name: string;
  image?: string;
  tag?: string;
  build?: boolean;
  ports: string[];
  volumes: string[];
  networks: string[];
  environment: { key: string; value: string; secret: boolean }[];
  dependsOn: string[];
  restart?: string;
  hasHealthcheck: boolean;
  hasResourceLimits: boolean;
  privileged: boolean;
}

export interface YamlSummary {
  services: ServiceSummary[];
  networks: string[];
  volumes: string[];
}

export interface AnalyzeResult {
  doc: any | null;
  parseError: string | null;
  findings: Finding[];
  summary: YamlSummary;
  counts: { error: number; warning: number; tip: number };
}

const TOP_LEVEL_KEYS = new Set([
  "name",
  "services",
  "networks",
  "volumes",
  "configs",
  "secrets",
]);

const SERVICE_KEYS = new Set([
  "image",
  "build",
  "container_name",
  "command",
  "entrypoint",
  "ports",
  "expose",
  "environment",
  "env_file",
  "volumes",
  "networks",
  "depends_on",
  "restart",
  "healthcheck",
  "labels",
  "user",
  "working_dir",
  "privileged",
  "cap_add",
  "cap_drop",
  "deploy",
  "logging",
  "extra_hosts",
  "dns",
  "profiles",
  "platform",
  "read_only",
  "tmpfs",
  "stop_grace_period",
]);

const DEPLOY_KEYS = new Set(["resources"]);
const RESOURCES_KEYS = new Set(["limits", "reservations"]);

function lineOf(text: string, key: string, fromLine = 0): number {
  const lines = text.split("\n");
  const re = new RegExp(`(^|\\s)${escapeRegExp(key)}\\s*:`, "m");
  for (let i = fromLine; i < lines.length; i++) {
    if (re.test(lines[i])) return i + 1;
  }
  return 0;
}

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function envList(env: any): { key: string; value: string }[] {
  if (Array.isArray(env)) {
    return env.map((e: any) => {
      const s = String(e ?? "");
      const eq = s.indexOf("=");
      return eq === -1 ? { key: s, value: "" } : { key: s.slice(0, eq), value: s.slice(eq + 1) };
    });
  }
  if (env && typeof env === "object") {
    return Object.entries(env).map(([k, v]) => ({ key: k, value: String(v ?? "") }));
  }
  return [];
}

const SECRET_KEY = /pass|pwd|secret|token|api.?key|private.?key|credential/i;

const isDbLike = (image: string, name: string) => {
  const i = (image ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  return (
    /mysql|mariadb|postgres|mongodb|redis|mssql|percona/.test(i) ||
    /mysql|mariadb|postgres|redis|db|database/.test(n)
  );
};

const isBackendLike = (image: string, name: string) => {
  const i = (image ?? "").toLowerCase();
  const n = (name ?? "").toLowerCase();
  return /backend|api|server|app|web/.test(i) || /backend|api|server|app/.test(n);
};

// Cache for analysis results keyed by YAML content hash
const analysisCache = new Map<string, { result: AnalyzeResult; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

function getCacheKey(yaml: string): string {
  // Simple hash based on first 2000 chars to avoid memory issues
  return yaml.substring(0, 2000);
}

export function analyzeYaml(
  text: string,
  liveContainers: DockerContainer[] = [],
): AnalyzeResult {
  // Check cache first
  const cacheKey = getCacheKey(text);
  const cached = analysisCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.result;
  }

  const findings: Finding[] = [];
  const summary: YamlSummary = { services: [], networks: [], volumes: [] };

  let doc: any | null = null;
  let parseError: string | null = null;

  // ---- Parse ----
  try {
    doc = yaml.load(text);
    if (doc === null || typeof doc !== "object" || Array.isArray(doc)) {
      parseError = "YAML must define a mapping (key/value) at the top level";
      doc = null;
    }
  } catch (e: any) {
    parseError = e.message || "Invalid YAML syntax";
    const lineMatch = (e.message || "").match(/line (\d+)/);
    if (lineMatch) {
      findings.push({
        severity: "error",
        code: "invalid-yaml",
        message: parseError ?? "Invalid YAML syntax",
        line: Number(lineMatch[1]),
        suggestedFix: "Fix the YAML syntax at the reported line.",
      });
    } else {
      findings.push({ severity: "error", code: "invalid-yaml", message: parseError ?? "Invalid YAML syntax", line: 1 });
    }
  }

  if (!doc) {
    return { doc: null, parseError, findings, summary, counts: tally(findings) };
  }

  // ---- Top-level keys ----
  for (const k of Object.keys(doc)) {
    if (!TOP_LEVEL_KEYS.has(k)) {
      findings.push({
        severity: "error",
        code: "unknown-key",
        message: `Unknown top-level key "${k}".`,
        line: lineOf(text, k),
        suggestedFix: `Remove "${k}" or rename it to a supported Compose key.`,
      });
    }
  }
  if (doc.networks && typeof doc.networks === "object" && !Array.isArray(doc.networks)) {
    summary.networks = Object.keys(doc.networks);
  }
  if (doc.volumes && typeof doc.volumes === "object" && !Array.isArray(doc.volumes)) {
    summary.volumes = Object.keys(doc.volumes);
  }

  // ---- Services ----
  const svcs = doc.services;
  if (!svcs || typeof svcs !== "object" || Array.isArray(svcs)) {
    findings.push({
      severity: "error",
      code: "missing-services",
      message: "No 'services' section found in YAML.",
      line: lineOf(text, "services") || 1,
    });
    return { doc, parseError, findings, summary, counts: tally(findings) };
  }

  const serviceNames: string[] = [];
  const containerNames: string[] = [];

  for (const name of Object.keys(svcs)) {
    const s = svcs[name];
    if (typeof s !== "object" || Array.isArray(s) || s === null) {
      findings.push({
        severity: "error",
        code: "invalid-service",
        message: `Service "${name}" must be a mapping.`,
        line: lineOf(text, name),
      });
      continue;
    }
    serviceNames.push(name);

    const serviceBaseLine = lineOf(text, name);
    const summ: ServiceSummary = {
      name,
      ports: [],
      volumes: [],
      networks: [],
      environment: [],
      dependsOn: [],
      restart: typeof s.restart === "string" ? s.restart : undefined,
      hasHealthcheck: Boolean(s.healthcheck && typeof s.healthcheck === "object"),
      hasResourceLimits: false,
      privileged: Boolean(s.privileged === true),
    };

    // Unknown service keys - be more lenient, only flag truly unknown keys
    const unknownKeys: string[] = [];
    for (const k of Object.keys(s)) {
      if (!SERVICE_KEYS.has(k)) {
        // Check if it's a common docker-compose key that might be valid
        const lower = k.toLowerCase();
        if (
          !/^(after_start|startup_|shm_size|ulimit|security_opt|network_mode|ipc_mode|pid_mode|uts_mode|cgroupns_mode|group_add)$/i.test(
            lower,
          )
        ) {
          unknownKeys.push(k);
        }
      }
    }

    if (unknownKeys.length > 0) {
      // Only show error for truly unknown keys, not minor ones
      const trulyUnknown = unknownKeys.filter(
        (k) => !/^( EnvironmentFile|env_file|tmpfile|volumes_from|volumes_from|extends|x-)/i.test(k),
      );
      if (trulyUnknown.length > 0) {
        for (const k of trulyUnknown) {
          findings.push({
            severity: "error",
            code: "unknown-key",
            message: `Unknown key "${k}" in service "${name}".`,
            line: lineOf(text, k, serviceBaseLine - 1) || serviceBaseLine,
            service: name,
            suggestedFix: `Remove "${k}" or check the Compose spec spelling.`,
          });
        }
      }
    }

    // image / tag
    const image = typeof s.image === "string" ? s.image : undefined;
    if (image) {
      summ.image = image;
      const tagMatch = image.match(/:([^/:]+)$/);
      summ.tag = tagMatch ? tagMatch[1] : undefined;
      if (!tagMatch || tagMatch[1] === "latest") {
        findings.push({
          severity: "warning",
          code: "latest-tag",
          message: `Service "${name}" uses image "${image}" without a specific tag (or uses :latest).`,
          line: lineOf(text, "image", serviceBaseLine - 1) || serviceBaseLine,
          service: name,
          suggestedFix: `Pin the image to a specific tag (e.g. ${image.split(":")[0]}:1.25).`,
        });
      }
    } else if (!s.build) {
      findings.push({
        severity: "error",
        code: "no-image-or-build",
        message: `Service "${name}" has neither "image" nor "build".`,
        line: serviceBaseLine,
        service: name,
      });
    }

    // build validity
    if (s.build && typeof s.build !== "string" && typeof s.build !== "object") {
      findings.push({
        severity: "error",
        code: "invalid-build",
        message: `Service "${name}": "build" must be a string or mapping.`,
        line: lineOf(text, "build", serviceBaseLine - 1) || serviceBaseLine,
        service: name,
      });
    }

    // container_name uniqueness
    if (typeof s.container_name === "string") {
      if (containerNames.includes(s.container_name)) {
        findings.push({
          severity: "error",
          code: "duplicate-container-name",
          message: `Duplicate container_name "${s.container_name}" (service "${name}").`,
          line: lineOf(text, "container_name", serviceBaseLine - 1) || serviceBaseLine,
          service: name,
        });
      } else {
        containerNames.push(s.container_name);
      }
      // live conflict
      const live = liveContainers.find((c) => c.name === s.container_name);
      if (live) {
        findings.push({
          severity: "error",
          code: "container-name-exists",
          message: `container_name "${s.container_name}" already exists on the Docker host.`,
          line: lineOf(text, "container_name", serviceBaseLine - 1) || serviceBaseLine,
          service: name,
          suggestedFix: "Change container_name or remove the existing container first.",
        });
      }
    }

    // ports: duplicates inside file + 0.0.0.0 for DBs + live host port conflicts
    const publishedHostPorts: number[] = [];
    if (Array.isArray(s.ports)) {
      for (const p of s.ports) {
        const ps = typeof p === "string" ? p : portString(p);
        summ.ports.push(ps);
        const m = ps.match(/^(\d+):/);
        if (m) {
          const hostPort = Number(m[1]);
          publishedHostPorts.push(hostPort);
          // published on 0.0.0.0 for DB-like services
          if ((/^0\.0\.0\.0:/.test(ps) || ps.includes(":0.0.0.0:")) && isDbLike(image ?? "", name)) {
            findings.push({
              severity: "warning",
              code: "db-exposed",
              message: `Service "${name}" publishes port ${hostPort} on 0.0.0.0 (database exposed to the network).`,
              line: lineOf(text, "ports", serviceBaseLine - 1) || serviceBaseLine,
              service: name,
              suggestedFix: "Bind to 127.0.0.1 or use a Docker network instead of publishing.",
            });
          }
          // live host port already in use
          const taken = liveContainers.some((c) =>
            c.ports.some((cp: { host?: number; container?: number; protocol: string }) => cp.host && cp.host === hostPort),
          );
          if (taken) {
            findings.push({
              severity: "error",
              code: "port-in-use",
              message: `Host port ${hostPort} (service "${name}") is already in use by a running container.`,
              line: lineOf(text, "ports", serviceBaseLine - 1) || serviceBaseLine,
              service: name,
              suggestedFix: `Change the host port (e.g. ${hostPort + 1}:${m[2] ?? ""}) or stop the conflicting container.`,
            });
          }
        }
      }
    }

    // volumes: named vs bind, DB named volume check
    if (Array.isArray(s.volumes)) {
      for (const v of s.volumes) {
        const vs = typeof v === "string" ? v : volumeToString(v);
        summ.volumes.push(vs);
      }
      if (isDbLike(image ?? "", name)) {
        const hasNamed = s.volumes.some((v: any) => {
          const vs = typeof v === "string" ? v : volumeToString(v);
          return !vs.includes("/") && !vs.includes(":");
        });
        if (!hasNamed) {
          findings.push({
            severity: "warning",
            code: "db-no-named-volume",
            message: `Database-like service "${name}" has no named volume — data will be lost on recreation.`,
            line: lineOf(text, "volumes", serviceBaseLine - 1) || serviceBaseLine,
            service: name,
            suggestedFix: `Add a named volume, e.g. ${name}-data:/var/lib/${name}.`,
          });
        }
      }
    }

    // networks per service
    if (Array.isArray(s.networks)) {
      summ.networks = s.networks.map((n: any) => String(n));
    } else if (typeof s.networks === "string") {
      summ.networks = [s.networks];
    }

    // environment
    summ.environment = envList(s.environment).map((e) => ({
      ...e,
      secret: SECRET_KEY.test(e.key),
    }));
    for (const e of summ.environment) {
      if (e.secret) {
        findings.push({
          severity: "warning",
          code: "hardcoded-secret",
          message: `Service "${name}" hardcodes a potential secret in environment: ${e.key}.`,
          line: lineOf(text, "environment", serviceBaseLine - 1) || serviceBaseLine,
          service: name,
          suggestedFix: "Move the value to an env_file or Docker secret and reference it here.",
        });
      }
    }

    // depends_on
    if (s.depends_on) {
      if (Array.isArray(s.depends_on)) {
        summ.dependsOn = s.depends_on.map((d: any) => String(d));
      } else if (typeof s.depends_on === "object") {
        summ.dependsOn = Object.keys(s.depends_on);
      }
    }
    // undefined service references
    for (const dep of summ.dependsOn) {
      if (!serviceNames.includes(dep)) {
        findings.push({
          severity: "error",
          code: "undefined-service-ref",
          message: `Service "${name}" depends_on "${dep}" which is not defined.`,
          line: lineOf(text, "depends_on", serviceBaseLine - 1) || serviceBaseLine,
          service: name,
          suggestedFix: `Define service "${dep}" or remove the reference.`,
        });
      }
    }

    // restart
    if (typeof s.restart === "string") {
      summ.restart = s.restart;
    } else {
      findings.push({
        severity: "warning",
        code: "no-restart",
        message: `Service "${name}" has no restart policy.`,
        line: serviceBaseLine,
        service: name,
        suggestedFix: 'Add `restart: unless-stopped` (or "always"/"on-failure").',
      });
    }

    // healthcheck on DB/backend
    if (!summ.hasHealthcheck && (isDbLike(image ?? "", name) || isBackendLike(image ?? "", name))) {
      findings.push({
        severity: "warning",
        code: "no-healthcheck",
        message: `Service "${name}" (${image ?? name}) has no healthcheck.`,
        line: serviceBaseLine,
        service: name,
        suggestedFix: "Add a healthcheck so dependents can wait for it to be ready.",
      });
    }

    // privileged
    if (s.privileged === true) {
      findings.push({
        severity: "warning",
        code: "privileged",
        message: `Service "${name}" runs privileged — a major security risk.`,
        line: lineOf(text, "privileged", serviceBaseLine - 1) || serviceBaseLine,
        service: name,
        suggestedFix: "Remove privileged and use cap_add/cap_drop instead.",
      });
    }

    // resource limits
    if (
      s.deploy &&
      typeof s.deploy === "object" &&
      s.deploy.resources &&
      (s.deploy.resources.limits || s.deploy.resources.reservations)
    ) {
      summ.hasResourceLimits = true;
    } else {
      findings.push({
        severity: "warning",
        code: "no-resource-limits",
        message: `Service "${name}" has no resource limits.`,
        line: serviceBaseLine,
        service: name,
        suggestedFix: "Add deploy.resources.limits (memory/cpus) to cap usage.",
      });
    }

    summary.services.push(summ);
  }

  // ---- depends_on cycles ----
  const graph = new Map<string, string[]>();
  for (const summ of summary.services) {
    graph.set(summ.name, summ.dependsOn);
  }
  const visiting = new Set<string>();
  const visited = new Set<string>();
  function dfs(node: string, path: string[]): boolean {
    if (visited.has(node)) return false;
    if (visiting.has(node)) {
      const cycleStart = path.indexOf(node);
      const cycle = path.slice(cycleStart).concat(node);
      findings.push({
        severity: "error",
        code: "depends-on-cycle",
        message: `depends_on cycle detected: ${cycle.join(" -> ")}.`,
        line: 1,
        suggestedFix: "Remove one of the edges in the cycle.",
      });
      return true;
    }
    visiting.add(node);
    path.push(node);
    for (const dep of graph.get(node) ?? []) {
      dfs(dep, path);
    }
    path.pop();
    visiting.delete(node);
    visited.add(node);
    return false;
  }
  for (const name of serviceNames) dfs(name, []);

  // ---- duplicate published ports inside file ----
  const portOccurrences = new Map<number, string[]>();
  for (const summ of summary.services) {
    for (const p of summ.ports) {
      const m = p.match(/^(\d+):/);
      if (m) {
        const hp = Number(m[1]);
        const arr = portOccurrences.get(hp) ?? [];
        arr.push(summ.name);
        portOccurrences.set(hp, arr);
      }
    }
  }
  for (const [hp, owners] of portOccurrences) {
    if (owners.length > 1) {
      findings.push({
        severity: "error",
        code: "duplicate-port",
        message: `Host port ${hp} is published by multiple services: ${owners.join(", ")}.`,
        line: 1,
        suggestedFix: "Assign distinct host ports to each service.",
      });
    }
  }

  // ---- external network references ----
  const declaredNetworks = new Set(summary.networks);
  for (const summ of summary.services) {
    for (const n of summ.networks) {
      // Treat names that look like external (not declared and not service-scoped defaults)
      if (!declaredNetworks.has(n) && n !== "default" && !n.startsWith(summ.name + "_")) {
        const exists = liveContainers.some((c) =>
          (c as any).networks?.includes?.(n),
        );
        if (!exists) {
          findings.push({
            severity: "error",
            code: "undefined-network",
            message: `Service "${summ.name}" references network "${n}" which is not declared or available.`,
            line: lineOf(text, "networks") || 1,
            service: summ.name,
            suggestedFix: `Declare network "${n}" at the top level or connect to an existing one.`,
          });
        }
      }
    }
  }

  // ---- Tips ----
  if (serviceNames.length > 1 && summary.networks.length === 0 && !doc.networks) {
    findings.push({
      severity: "tip",
      code: "group-networks",
      message: "Consider grouping services into named networks for clearer communication boundaries.",
      line: 1,
      suggestedFix: "Add a top-level `networks` section and attach services.",
    });
  }
  if (!doc.name) {
    findings.push({
      severity: "tip",
      code: "stack-name",
      message: "No top-level `name` set — the project will default to the folder name.",
      line: lineOf(text, "name") || 1,
      suggestedFix: "Add `name: <your-stack>` at the top level.",
    });
  }
  // Tip: consider .env only if there are services without environment but with env_file
  if (summary.services.some((s) => !s.environment.length && s.environment.length === 0)) {
    // already handled below
  }

  const result = { doc, parseError, findings, summary, counts: tally(findings) };

  // Cache the result
  analysisCache.set(cacheKey, { result, timestamp: Date.now() });

  return result;
}

function volumeToString(v: any): string {
  if (typeof v === "string") return v;
  const obj = v ?? {};
  const source = String(obj.source ?? "");
  const target = String(obj.target ?? "");
  const mode = obj.read_only ? ":ro" : "";
  return `${source}:${target}${mode}`;
}

function portString(p: any): string {
  if (typeof p === "string") return p;
  const obj = p ?? {};
  const target = String(obj.target ?? obj.published ?? "");
  const published = obj.published != null ? String(obj.published) : "";
  return published ? `${published}:${target}` : target;
}

function tally(findings: Finding[]): { error: number; warning: number; tip: number } {
  return {
    error: findings.filter((f) => f.severity === "error").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    tip: findings.filter((f) => f.severity === "tip").length,
  };
}