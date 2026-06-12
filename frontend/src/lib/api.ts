import type { CodegenResponse, HarnessGraph, RunResponse, TemplateSummary } from "../types";

const API_BASE = import.meta.env.VITE_API_BASE ?? "http://localhost:8000";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(detail || `Request failed: ${response.status}`);
  }
  return response.json() as Promise<T>;
}

export function listTemplates(): Promise<TemplateSummary[]> {
  return request<TemplateSummary[]>("/templates");
}

export function getTemplate(templateId: string): Promise<HarnessGraph> {
  return request<HarnessGraph>(`/templates/${templateId}`);
}

export function runGraph(graph: HarnessGraph): Promise<RunResponse> {
  return request<RunResponse>("/run", {
    method: "POST",
    body: JSON.stringify({ graph }),
  });
}

export function generateCode(graph: HarnessGraph): Promise<CodegenResponse> {
  return request<CodegenResponse>("/generate-code", {
    method: "POST",
    body: JSON.stringify({ graph }),
  });
}
