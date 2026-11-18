export type ContainerCategory =
  | "Database: MySQL"
  | "Database: PostgreSQL"
  | "Cache / Queue"
  | "Backend / API"
  | "AI / ML"
  | "Management tools"
  | "Cloud emulators / infra"
  | "Web apps"
  | "Uncategorized";

export const CATEGORIES: ContainerCategory[] = [
  "Database: MySQL",
  "Database: PostgreSQL",
  "Cache / Queue",
  "Backend / API",
  "AI / ML",
  "Management tools",
  "Cloud emulators / infra",
  "Web apps",
  "Uncategorized",
];

export interface RawContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state?: string;
  ports: { host?: number; container?: number; protocol: string }[];
  created: number;
  labels?: Record<string, string>;
  [key: string]: unknown;
}

export interface CategorizedContainer extends RawContainer {
  category: ContainerCategory;
  customTags: string[];
  categorySource: string;
}

/** Detection hints are checked in order; the first match wins. */
export function categorize(
  name: string,
  image: string,
  ports: { host?: number; container?: number; protocol: string }[] = [],
  labels: Record<string, string> = {},
): { category: ContainerCategory; source: string } {
  const imageL = (image ?? "").toLowerCase();
  const nameL = (name ?? "").toLowerCase();
  const hostPorts = ports
    .filter((p) => p.host != null)
    .map((p) => String(p.host));
  const allPorts = [...hostPorts, ...ports.map((p) => String(p.container))];

  const hasPort = (...ps: string[]) => ps.some((p) => allPorts.includes(p));
  const imageContains = (...ks: string[]) => ks.some((k) => imageL.includes(k));
  const nameContains = (...ks: string[]) => ks.some((k) => nameL.includes(k));
  const labelContains = (...ks: string[]) =>
    ks.some((k) => Object.values(labels).some((v) => v.toLowerCase().includes(k)));

  // Cloud emulators / infra (specific first)
  if (imageContains("floci", "localstack", "minio") || nameContains("floci", "localstack", "minio")) {
    return { category: "Cloud emulators / infra", source: "image/name contains floci/localstack/minio" };
  }

  // Databases
  if (imageContains("mysql", "mariadb") || nameContains("mysql", "mariadb") || hasPort("3306", "33060")) {
    return { category: "Database: MySQL", source: "image/name contains mysql/mariadb or port 3306/33060" };
  }
  if (imageContains("postgres") || nameContains("postgres") || hasPort("5432")) {
    return { category: "Database: PostgreSQL", source: "image/name contains postgres or port 5432" };
  }

  // Cache / Queue
  if (
    imageContains("redis", "valkey", "memcached", "rabbitmq") ||
    nameContains("redis", "valkey", "memcached", "rabbitmq")
  ) {
    return { category: "Cache / Queue", source: "image/name contains redis/valkey/memcached/rabbitmq" };
  }

  // AI / ML
  if (
    imageContains("ollama", "machine-learning", "rocm", "cuda") ||
    nameContains("ollama", "machine-learning", "rocm", "cuda") ||
    labelContains("ollama", "machine-learning", "rocm", "cuda")
  ) {
    return { category: "AI / ML", source: "image/name/label contains ollama/machine-learning/rocm/cuda" };
  }

  // Management tools
  if (
    imageContains("portainer", "traefik", "nginx-proxy") ||
    nameContains("portainer", "traefik", "nginx-proxy")
  ) {
    return { category: "Management tools", source: "image/name contains portainer/traefik/nginx-proxy" };
  }

  // Backend / API
  if (nameContains("backend", "api", "server") || imageContains("backend", "api", "server")) {
    return { category: "Backend / API", source: "name or image contains backend/api/server" };
  }

  // Web apps: other apps exposing HTTP ports
  if (hasPort("80", "8080", "3000", "4000", "5000", "8000", "8081", "9000")) {
    return { category: "Web apps", source: "exposes common HTTP port without a more specific match" };
  }

  return { category: "Uncategorized", source: "no detection rule matched" };
}

/** Apply auto-categorization, keeping any previously stored custom tag as the category. */
export function categorizeContainer(
  c: RawContainer,
  overrides: Record<string, ContainerCategory> = {},
): CategorizedContainer {
  const override = overrides[c.id] ?? overrides[c.name ?? ""];
  if (override) {
    return { ...c, category: override, customTags: [], categorySource: "user override" };
  }
  const { category, source } = categorize(c.name, c.image, c.ports, c.labels ?? {});
  return { ...c, category, customTags: [], categorySource: source };
}

export function categoryColor(category: ContainerCategory): string {
  const map: Record<ContainerCategory, string> = {
    "Database: MySQL": "bg-blue-500/10 text-blue-600 border-blue-500/20",
    "Database: PostgreSQL": "bg-indigo-500/10 text-indigo-600 border-indigo-500/20",
    "Cache / Queue": "bg-emerald-500/10 text-emerald-600 border-emerald-500/20",
    "Backend / API": "bg-purple-500/10 text-purple-600 border-purple-500/20",
    "AI / ML": "bg-violet-500/10 text-violet-600 border-violet-500/20",
    "Management tools": "bg-amber-500/10 text-amber-600 border-amber-500/20",
    "Cloud emulators / infra": "bg-orange-500/10 text-orange-600 border-orange-500/20",
    "Web apps": "bg-cyan-500/10 text-cyan-600 border-cyan-500/20",
    Uncategorized: "bg-muted text-muted-foreground border-muted/30",
  };
  return map[category] ?? map.Uncategorized;
}
