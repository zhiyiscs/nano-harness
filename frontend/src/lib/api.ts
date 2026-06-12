import type { CodegenResponse, HarnessGraph, RunResponse, TemplateSummary } from "../types";
import { generateLocalCode, getLocalTemplate, listLocalTemplates, runLocalGraph } from "./localHarness";

const API_BASE = import.meta.env.VITE_API_BASE;

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
  if (!API_BASE) {
    return Promise.resolve(listLocalTemplates());
  }
  return request<TemplateSummary[]>("/templates");
}

export function getTemplate(templateId: string): Promise<HarnessGraph> {
  if (!API_BASE) {
    return Promise.resolve(getLocalTemplate(templateId));
  }
  return request<HarnessGraph>(`/templates/${templateId}`);
}

export function runGraph(graph: HarnessGraph): Promise<RunResponse> {
  if (!API_BASE) {
    return Promise.resolve(runLocalGraph(graph));
  }
  return request<RunResponse>("/run", {
    method: "POST",
    body: JSON.stringify({ graph }),
  });
}

export function generateCode(graph: HarnessGraph): Promise<CodegenResponse> {
  if (!API_BASE) {
    return Promise.resolve(generateLocalCode(graph));
  }
  return request<CodegenResponse>("/generate-code", {
    method: "POST",
    body: JSON.stringify({ graph }),
  });
}
