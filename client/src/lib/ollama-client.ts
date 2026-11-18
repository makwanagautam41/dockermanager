import { api, getStoredToken } from "@/lib/api";

export type AIFocus = "Improve options" | "Naming conventions" | "Security" | "Performance" | "All";

export interface AiSuggestion {
  id: string;
  what: string; // what to change
  why: string; // rationale
  before: string; // snippet
  after: string; // suggested replacement
  confidence: number; // 0-100
  accepted?: boolean;
  rejected?: boolean;
}

export interface OllamaClient {
  check: () => Promise<{ connected: boolean; models: string[]; error?: string }>;
  analyze: (
    payload: {
      yaml: string;
      findings: any[];
      model: string;
      focus: AIFocus;
      maskSecrets: boolean;
    },
    onProgress?: (text: string) => void,
  ) => Promise<{ suggestions: AiSuggestion[] } | { error: string; raw?: string }>;
}

const secretRegex = /(PASS|PWD|SECRET|TOKEN|API.?KEY|PRIVATE.?KEY|CREDENTIAL)=([^\s]+)/i;

function maskSecretValues(yaml: string): string {
  return yaml.replace(secretRegex, (m, key, value) => `${key}=***`);
}

export const ollamaClient: OllamaClient = {
  async check() {
    try {
      const status = await api.ollamaStatus();
      let models: string[] = [];
      if (status.connected) {
        const list = await api.ollamaModels();
        models = list.map((m) => m.name);
      }
      return { connected: status.connected, models, error: status.error };
    } catch (e: any) {
      return { connected: false, models: [], error: e.message };
    }
  },

  async analyze({ yaml, findings, model, focus, maskSecrets }, onProgress) {
    const safeYaml = maskSecrets ? maskSecretValues(yaml) : yaml;
    const findingsSummary = findings
      .map((f) => `- [${f.severity}] ${f.message}${f.service ? ` (service: ${f.service})` : ""} (line ${f.line})`)
      .join("\n") || "(none)";

    const prompt = `You are a Docker Compose expert. Review the compose YAML and the built-in rule-engine findings below.

Focus area: ${focus}.

Return ONLY a JSON object with this exact shape (no markdown fences, no extra text):
{
  "suggestions": [
    {
      "id": "s1",
      "what": "short description of what to change",
      "why": "rationale for the change",
      "before": "exact YAML snippet to replace",
      "after": "suggested replacement YAML snippet",
      "confidence": 85
    }
  ]
}

YAML:
\`\`\`yaml
${safeYaml}
\`\`\`

Rule-engine findings:
${findingsSummary}

Guidelines:
- Each suggestion must have a valid "before" snippet that exists verbatim in the YAML.
- confidence is 0-100.
- Be conservative: only suggest safe, deterministic changes.
- Do not mask or invent secrets.
`;

    try {
      const res = await fetch(api.ollamaChatStreamUrl(), {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${getStoredToken()}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: prompt }],
          stream: false,
        }),
      });

      let raw = "";
      if (res.ok) {
        const data = await res.json();
        raw = data.message?.content ?? data.content ?? JSON.stringify(data);
      } else {
        const body = await res.text().catch(() => "");
        return { error: `Ollama returned HTTP ${res.status}${body ? ": " + body : ""}`, raw: body };
      }

      let parsed: any;
      try {
        parsed = JSON.parse(raw);
      } catch {
        // Try to extract a JSON object embedded in text
        const start = raw.indexOf("{");
        const end = raw.lastIndexOf("}");
        if (start !== -1 && end !== -1 && end > start) {
          try {
            parsed = JSON.parse(raw.slice(start, end + 1));
          } catch {
            return { error: "Ollama returned invalid JSON", raw };
          }
        } else {
          return { error: "Ollama returned invalid JSON", raw };
        }
      }

      const suggestions: AiSuggestion[] = (parsed.suggestions ?? []).map((s: any, i: number) => ({
        id: s.id || `s-${i}`,
        what: String(s.what ?? ""),
        why: String(s.why ?? ""),
        before: String(s.before ?? ""),
        after: String(s.after ?? ""),
        confidence: Math.min(100, Math.max(0, Number(s.confidence) ?? 50)),
      }));

      return { suggestions };
    } catch (e: any) {
      if (e.name === "AbortError") return { error: "Request cancelled" };
      return { error: e.message ?? "AI analysis failed" };
    }
  },
};
