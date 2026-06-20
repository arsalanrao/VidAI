import { API_BASE_URL, POLL_INTERVAL_MS } from '../config/api';
import type { ProjectPreferences } from '../constants/creativeOptions';
import type {
  ActionResponse,
  CreateProjectResponse,
  ProjectListItem,
  ProjectResult,
  ProjectStatusResponse,
} from '../types/project';

export type PcHealthResponse = {
  ok: boolean;
  configured?: boolean;
  message: string;
};

export type ResumeRenderResponse = ActionResponse & {
  pcOnline?: boolean;
};

class ApiError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.name = 'ApiError';
  }
}

async function parseJson<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!text) {
    return {} as T;
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, text.slice(0, 200));
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const hasBody = init?.body !== undefined && init?.body !== null && init?.body !== '';

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    headers: {
      ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
      ...(init?.headers ?? {}),
    },
  });

  const body = await parseJson<T & { error?: string; message?: string }>(response);

  if (!response.ok) {
    const message = body.error ?? body.message ?? `Request failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return body;
}

export async function listProjects(limit = 50): Promise<ProjectListItem[]> {
  const body = await request<{ projects?: ProjectListItem[] }>(`/api/projects?limit=${limit}`);
  const items = Array.isArray(body.projects) ? body.projects : [];

  return items.map((item) => ({
    ...item,
    completeness: item.completeness ?? {
      percent: 0,
      script: false,
      thumbnail: false,
      scenesDone: 0,
      scenesTotal: 0,
      narration: false,
      video: false,
      uploadReady: false,
    },
  }));
}

export async function createProject(
  youtubeUrl: string,
  preferences?: ProjectPreferences,
): Promise<CreateProjectResponse> {
  return request<CreateProjectResponse>('/api/project/create', {
    method: 'POST',
    body: JSON.stringify({ youtubeUrl, preferences }),
  });
}

export async function getProjectStatus(projectId: string): Promise<ProjectStatusResponse> {
  return request<ProjectStatusResponse>(`/api/project/${projectId}/status`);
}

export async function getProjectResult(projectId: string): Promise<ProjectResult> {
  const body = await request<ProjectResult>(`/api/project/${projectId}/result`);

  return {
    ...body,
    tags: Array.isArray(body.tags) ? body.tags : [],
    scenes: Array.isArray(body.scenes) ? body.scenes : [],
  };
}

export async function checkApiHealth(): Promise<boolean> {
  try {
    const response = await fetch(`${API_BASE_URL}/health`);
    const body = (await response.json()) as { ok?: boolean };
    return Boolean(body.ok);
  } catch {
    return false;
  }
}

export async function checkPcRendererHealth(): Promise<PcHealthResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/health/pc`);
    return (await response.json()) as PcHealthResponse;
  } catch {
    return { ok: false, message: 'Could not reach API health check' };
  }
}

export async function resumeProjectRender(projectId: string): Promise<ResumeRenderResponse> {
  return request<ResumeRenderResponse>(`/api/project/${projectId}/resume-render`, {
    method: 'POST',
    body: '{}',
  });
}

export async function retryPipeline(projectId: string): Promise<ActionResponse> {
  return request<ActionResponse>(`/api/project/${projectId}/retry-pipeline`, {
    method: 'POST',
    body: '{}',
  });
}

export async function regenerateThumbnail(projectId: string): Promise<ActionResponse> {
  return request<ActionResponse>(`/api/project/${projectId}/regenerate-thumbnail`, {
    method: 'POST',
    body: '{}',
  });
}

export async function retryStart(
  projectId: string,
  youtubeUrl?: string,
): Promise<ActionResponse> {
  return request<ActionResponse>(`/api/project/${projectId}/retry-start`, {
    method: 'POST',
    body: JSON.stringify({ youtubeUrl }),
  });
}

export async function retryScript(
  projectId: string,
  userDirection?: string,
  youtubeUrl?: string,
): Promise<ActionResponse> {
  return request<ActionResponse>(`/api/project/${projectId}/retry-script`, {
    method: 'POST',
    body: JSON.stringify({ userDirection, youtubeUrl }),
  });
}

export async function retryImages(
  projectId: string,
  options?: {
    sceneId?: string;
    promptOverride?: string;
    thumbnailPromptOverride?: string;
  },
): Promise<ActionResponse> {
  return request<ActionResponse>(`/api/project/${projectId}/retry-images`, {
    method: 'POST',
    body: JSON.stringify(options ?? {}),
  });
}

export async function retryAudio(
  projectId: string,
  voicePreset?: string,
): Promise<ActionResponse> {
  return request<ActionResponse>(`/api/project/${projectId}/retry-audio`, {
    method: 'POST',
    body: JSON.stringify({ voicePreset }),
  });
}

export async function fixRender(projectId: string): Promise<ActionResponse> {
  return request<ActionResponse>(`/api/project/${projectId}/fix-render`, {
    method: 'POST',
    body: '{}',
  });
}

export async function regenerateScene(
  projectId: string,
  sceneId: string,
  promptOverride?: string,
): Promise<ActionResponse> {
  return request<ActionResponse>(`/api/project/${projectId}/scenes/${sceneId}/regenerate`, {
    method: 'POST',
    body: JSON.stringify({ promptOverride }),
  });
}

export async function deleteProject(projectId: string): Promise<ActionResponse> {
  const response = await fetch(`${API_BASE_URL}/api/project/${projectId}`, {
    method: 'DELETE',
  });

  const body = await parseJson<ActionResponse & { error?: string; message?: string }>(response);

  if (!response.ok) {
    const message = body.error ?? body.message ?? `Delete failed (${response.status})`;
    throw new ApiError(response.status, message);
  }

  return body;
}

export { ApiError };
