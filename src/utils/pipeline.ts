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
    label: 'Video render (your PC)',
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

  if (errorMessage.includes('waiting_for_renderer') || errorMessage.includes('PC renderer')) {
    return 'Your PC renderer was offline. Tap Retry PC render after starting ai-server and the tunnel.';
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
      return 'Rendering video on your PC (several minutes)…';
    case 'waiting_for_renderer':
      return 'Waiting for your PC renderer — turn on PC + tunnel';
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
