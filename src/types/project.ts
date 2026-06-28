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
  youtubeUrl?: string;
  failedStage?: PipelineFailedStage | null;
  recoveryAttempt?: number;
  completeness?: ProjectCompleteness;
  imageRecovery?: ImageRecoveryInfo | null;
  scenes?: Array<{
    id: string;
    order: number;
    prompt: string;
    hasImage: boolean;
  }>;
};

export type PipelineFailedStage = 'start' | 'script' | 'images' | 'audio' | 'render';

export type ImageRecoveryInfo = {
  blockedPrompt: string | null;
  suggestedPrompt: string | null;
  promptAlternatives: string[];
  failedSceneId: string | null;
  failedSceneOrder: number | null;
  aiPrompt: string | null;
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
  failedStage?: PipelineFailedStage | null;
  recoveryAttempt?: number;
  completeness: ProjectCompleteness;
};

export type ProjectListItem = {
  id: string;
  title: string | null;
  status: ProjectStatus;
  errorMessage: string | null;
  updatedAt: string;
  youtubeUrl: string;
  thumbnail: string | null;
  videoUrl: string | null;
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
