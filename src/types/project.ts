export type ProjectStatus =
  | 'queued'
  | 'processing'
  | 'script_ready'
  | 'images_ready'
  | 'narration_ready'
  | 'rendering'
  | 'waiting_for_renderer'
  | 'rendered_local'
  | 'done'
  | 'failed';

export type ProjectCompleteness = {
  percent: number;
  script: boolean;
  thumbnail: boolean;
  scenesDone: number;
  scenesTotal: number;
  narration: boolean;
  video: boolean;
  uploadReady: boolean;
};

export type ProjectStatusResponse = {
  id: string;
  status: ProjectStatus;
  title: string | null;
  errorMessage: string | null;
  updatedAt: string;
};

export type SceneResult = {
  id: string;
  order: number;
  prompt: string;
  imageUrl: string | null;
  duration: number;
  complete?: boolean;
};

export type ProjectResult = {
  id: string;
  status: ProjectStatus;
  title: string | null;
  description: string | null;
  hook: string | null;
  tags: string[];
  thumbnail: string | null;
  videoUrl: string | null;
  narrationUrl: string | null;
  scenes: SceneResult[];
  errorMessage: string | null;
  completeness: ProjectCompleteness;
};

export type ProjectListItem = {
  id: string;
  title: string | null;
  status: ProjectStatus;
  errorMessage: string | null;
  updatedAt: string;
  youtubeUrl: string;
  completeness: ProjectCompleteness;
};

export type CreateProjectResponse = {
  projectId: string;
  status: ProjectStatus;
};

export type ActionResponse = {
  ok: boolean;
  message: string;
  status?: string;
};
