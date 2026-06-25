import type { UserProfile, CountyConfig } from '../types';
import type { Project, PipelineTrace, StageUpdate, SandboxRunSummary } from '../types';

const API_BASE = import.meta.env.VITE_API_URL ?? '';

let authToken: string | null = null;

export function setAuthToken(token: string | null): void {
  authToken = token;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string> | undefined),
  };

  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }

  if (authToken) {
    headers.Authorization = `Bearer ${authToken}`;
  }

  const response = await fetch(`${API_BASE}${path}`, { ...options, headers });

  if (response.status === 204) return undefined as T;

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? `Request failed: ${response.status}`);
  }
  return data as T;
}

export const api = {
  getProfile: () => request<{ profile: UserProfile }>('/api/profile'),
  createProfile: (body: {
    company: string;
    service_categories: string[];
    geography: string[];
  }) =>
    request<{ profile: UserProfile }>('/api/profile', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  updateProfile: (body: Partial<UserProfile>) =>
    request<{ profile: UserProfile }>('/api/profile', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  getProjects: (params: Record<string, string | number | undefined> = {}) => {
    const qs = new URLSearchParams();
    Object.entries(params).forEach(([k, v]) => {
      if (v !== undefined && v !== '' && v !== 'all') qs.set(k, String(v));
    });
    const query = qs.toString();
    return request<{ projects: Project[]; total: number }>(
      `/api/projects${query ? `?${query}` : ''}`,
    );
  },

  getProject: (id: string) => request<{ project: Project }>(`/api/projects/${id}`),

  getMatches: () => request<{ matches: Project[]; total: number }>('/api/matches'),

  getCounties: () => request<{ counties: CountyConfig[] }>('/api/counties'),

  getTracks: () =>
    request<{ tracks: Array<{ project_id: string }>; projects: Project[] }>('/api/tracks'),

  trackProject: (projectId: string) =>
    request<{ track: { project_id: string } }>(`/api/tracks/${projectId}`, { method: 'POST' }),

  untrackProject: (projectId: string) =>
    request<void>(`/api/tracks/${projectId}`, { method: 'DELETE' }),

  getUpdates: () => request<{ updates: StageUpdate[] }>('/api/updates'),

  runPipelineTest: (body: { url?: string; profile: UserProfile }, pdf?: File) => {
    if (pdf) {
      const form = new FormData();
      if (body.url) form.append('url', body.url);
      form.append('profile', JSON.stringify(body.profile));
      form.append('pdf', pdf);
      return request<{ job_id: string; status: string }>('/api/admin/pipeline/test', {
        method: 'POST',
        body: form,
      });
    }
    return request<{ job_id: string; status: string }>('/api/admin/pipeline/test', {
      method: 'POST',
      body: JSON.stringify(body),
    });
  },

  getPipelineTrace: (jobId: string) =>
    request<{ trace: PipelineTrace }>(`/api/admin/pipeline/trace/${jobId}`),

  getSandboxRuns: () => request<{ runs: SandboxRunSummary[] }>('/api/admin/sandbox/runs'),
};
