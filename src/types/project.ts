export type ProjectStatus =
  | 'queued'
  | 'processing'
  | 'narration_ready'
  | 'rendering'
  | 'waiting_for_renderer'
  | 'rendered_local'
  | 'done'
  | 'failed';

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
};

export type ProjectResult = {
  id: string;
  status: ProjectStatus;
  title: string | null;
  thumbnail: string | null;
  videoUrl: string | null;
  narrationUrl: string | null;
  scenes: SceneResult[];
  errorMessage: string | null;
};

export type CreateProjectResponse = {
  projectId: string;
  status: ProjectStatus;
};
