import type { ProjectStatus } from '../types/project';

export type PipelineStep = {
  id: string;
  label: string;
  statuses: ProjectStatus[];
};

export const PIPELINE_STEPS: PipelineStep[] = [
  {
    id: 'queue',
    label: 'Starting',
    statuses: ['queued'],
  },
  {
    id: 'generate',
    label: 'Script, images & voice',
    statuses: ['processing', 'narration_ready'],
  },
  {
    id: 'render',
    label: 'Video render (cloud FFmpeg)',
    statuses: ['rendering', 'rendered_local', 'waiting_for_renderer'],
  },
  {
    id: 'done',
    label: 'Ready to preview',
    statuses: ['done'],
  },
];

export function stepIndexForStatus(status: ProjectStatus): number {
  const index = PIPELINE_STEPS.findIndex((step) => step.statuses.includes(status));

  if (index >= 0) {
    return index;
  }

  if (status === 'failed') {
    return 1;
  }

  return 0;
}

export function canRetryPcRender(status: ProjectStatus): boolean {
  return (
    status === 'waiting_for_renderer' ||
    status === 'rendering' ||
    status === 'rendered_local'
  );
}

export function canRetryPipeline(status: ProjectStatus): boolean {
  return status === 'failed';
}

export function isPcRenderError(errorMessage: string | null | undefined): boolean {
  if (!errorMessage) {
    return false;
  }

  const lower = errorMessage.toLowerCase();
  return (
    lower.includes('502') ||
    lower.includes('503') ||
    lower.includes('ffmpeg') ||
    lower.includes('render failed') ||
    lower.includes('waiting_for_renderer') ||
    lower.includes('cloud render')
  );
}

export function formatProjectError(errorMessage: string | null | undefined): string | null {
  if (!errorMessage) {
    return null;
  }

  if (errorMessage.includes('CONTENT_FILTERED')) {
    return 'An image was blocked by the safety filter. The server retries automatically — please create a new Short and try again.';
  }

  if (errorMessage.includes('FLUX')) {
    return 'Image generation failed. Try a different source video or try again in a minute.';
  }

  if (errorMessage.includes('502') || errorMessage.includes('503')) {
    return 'Cloud video render failed. Tap Retry video render — no PC required.';
  }

  if (errorMessage.includes('waiting_for_renderer') || errorMessage.includes('render failed')) {
    return 'Cloud render failed. Tap Retry video render to re-run FFmpeg motion + captions on Render.';
  }

  return errorMessage.length > 220 ? `${errorMessage.slice(0, 220)}…` : errorMessage;
}

export function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued…';
    case 'processing':
      return 'Generating script, scenes & narration…';
    case 'narration_ready':
      return 'Narration ready — starting video render…';
    case 'rendering':
      return 'Rendering video on cloud (FFmpeg motion + captions)…';
    case 'waiting_for_renderer':
      return 'Render failed — tap Retry video render';
    case 'rendered_local':
      return 'Uploading final video…';
    case 'done':
      return 'Complete!';
    case 'failed':
      return 'Something went wrong';
    default:
      return status;
  }
}

export function isTerminalStatus(status: ProjectStatus): boolean {
  return status === 'done' || status === 'failed';
}

export function isThumbnailReady(status: ProjectStatus): boolean {
  return ['narration_ready', 'rendering', 'waiting_for_renderer', 'rendered_local', 'done'].includes(
    status,
  );
}
