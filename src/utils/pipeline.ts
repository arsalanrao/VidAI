import type { ProjectStatus } from '../types/project';

export type PipelineStepId = 'start' | 'script' | 'images' | 'audio' | 'render' | 'done';

export type PipelineFailedStage = 'start' | 'script' | 'images' | 'audio' | 'render';

export type StepVisualState = 'pending' | 'active' | 'done' | 'failed';

export type DetailedPipelineStep = {
  id: PipelineStepId;
  label: string;
};

export const DETAILED_PIPELINE_STEPS: DetailedPipelineStep[] = [
  { id: 'start', label: 'Starting project' },
  { id: 'script', label: 'Writing script' },
  { id: 'images', label: 'Creating images' },
  { id: 'audio', label: 'Generating voice' },
  { id: 'render', label: 'Rendering video' },
  { id: 'done', label: 'Ready to preview' },
];

export type PipelineStep = {
  id: string;
  label: string;
  statuses: ProjectStatus[];
};

/** @deprecated Use DETAILED_PIPELINE_STEPS */
export const PIPELINE_STEPS: PipelineStep[] = [
  { id: 'queue', label: 'Starting', statuses: ['queued'] },
  {
    id: 'generate',
    label: 'Script, images & voice',
    statuses: ['processing', 'script_ready', 'images_ready', 'narration_ready'],
  },
  {
    id: 'render',
    label: 'Video render (cloud FFmpeg)',
    statuses: ['rendering', 'rendered_local', 'waiting_for_renderer'],
  },
  { id: 'done', label: 'Ready to preview', statuses: ['done'] },
];

export type StepCompleteness = {
  script: boolean;
  thumbnail: boolean;
  scenesDone: number;
  scenesTotal: number;
  narration: boolean;
  video: boolean;
};

export function stepDone(stepId: PipelineStepId, completeness: StepCompleteness): boolean {
  switch (stepId) {
    case 'start':
      return completeness.script || completeness.scenesTotal > 0;
    case 'script':
      return completeness.script;
    case 'images':
      return (
        completeness.thumbnail &&
        completeness.scenesTotal > 0 &&
        completeness.scenesDone === completeness.scenesTotal
      );
    case 'audio':
      return completeness.narration;
    case 'render':
      return completeness.video;
    case 'done':
      return completeness.video;
    default:
      return false;
  }
}

export function resolveStepStates(input: {
  status: ProjectStatus;
  failedStage: PipelineFailedStage | null;
  completeness: StepCompleteness;
}): StepVisualState[] {
  const { status, failedStage, completeness } = input;
  const states: StepVisualState[] = [];

  for (const step of DETAILED_PIPELINE_STEPS) {
    if (status === 'done' && step.id !== 'done') {
      states.push('done');
      continue;
    }

    if (step.id === 'done') {
      states.push(status === 'done' ? 'done' : 'pending');
      continue;
    }

    if (failedStage === step.id && (status === 'failed' || status === 'waiting_for_renderer')) {
      states.push('failed');
      continue;
    }

    if (stepDone(step.id, completeness)) {
      states.push('done');
      continue;
    }

    const isActive =
      (step.id === 'start' && status === 'queued') ||
      (step.id === 'script' &&
        (status === 'processing' || status === 'script_ready') &&
        !stepDone('script', completeness)) ||
      (step.id === 'images' &&
        (status === 'processing' || status === 'script_ready' || status === 'images_ready') &&
        stepDone('script', completeness) &&
        !stepDone('images', completeness)) ||
      (step.id === 'audio' &&
        (status === 'processing' || status === 'images_ready' || status === 'narration_ready') &&
        stepDone('images', completeness) &&
        !stepDone('audio', completeness)) ||
      (step.id === 'render' &&
        ['rendering', 'rendered_local', 'waiting_for_renderer', 'narration_ready'].includes(status) &&
        stepDone('audio', completeness) &&
        !stepDone('render', completeness));

    states.push(isActive ? 'active' : 'pending');
  }

  return states;
}

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
    lower.includes('memory') ||
    lower.includes('waiting_for_renderer') ||
    lower.includes('cloud render')
  );
}

export function inferFailedStageFromMessage(
  errorMessage: string | null | undefined,
): PipelineFailedStage | null {
  if (!errorMessage) {
    return null;
  }

  const lower = errorMessage.toLowerCase();

  if (
    lower.includes('youtube') ||
    lower.includes('invalid youtube') ||
    lower.includes('ytdlp') ||
    lower.includes('could not fetch')
  ) {
    return 'start';
  }

  if (lower.includes('kimi') || lower.includes('invalid json')) {
    return 'script';
  }

  if (lower.includes('flux') || lower.includes('content_filtered')) {
    return 'images';
  }

  if (lower.includes('tts') || lower.includes('magpie') || lower.includes('narration')) {
    return 'audio';
  }

  if (lower.includes('ffmpeg') || lower.includes('render') || lower.includes('memory')) {
    return 'render';
  }

  return null;
}

export function formatProjectError(
  errorMessage: string | null | undefined,
  failedStage?: PipelineFailedStage | null,
): string | null {
  if (!errorMessage) {
    return null;
  }

  const stage = failedStage ?? inferFailedStageFromMessage(errorMessage);

  if (errorMessage.includes('CONTENT_FILTERED') || stage === 'images') {
    return 'An image was blocked by the safety filter. Edit the scene prompt below and tap Retry images — the server will use softer, family-friendly prompts.';
  }

  if (errorMessage.includes('FLUX')) {
    return 'Image generation failed. Edit the prompt below or tap Retry images to try a safer visual approach.';
  }

  if (stage === 'script') {
    return 'Script generation failed. Add direction below (e.g. tone, angle, audience) and tap Retry script.';
  }

  if (stage === 'start') {
    return 'Could not start from this YouTube URL. Tap Start again to try a different extraction method, or paste a different URL.';
  }

  if (stage === 'audio') {
    return 'Voice generation failed. Pick a different voice preset and tap Retry audio.';
  }

  if (
    stage === 'render' ||
    errorMessage.includes('502') ||
    errorMessage.includes('503') ||
    errorMessage.includes('memory')
  ) {
    return 'Cloud video render failed (often server memory limits on free tier). Tap Fix & retry render — uses low-memory mode automatically.';
  }

  if (errorMessage.includes('waiting_for_renderer') || errorMessage.includes('render failed')) {
    return 'Cloud render failed. Tap Fix & retry render to re-run FFmpeg with safer server settings.';
  }

  return errorMessage.length > 220 ? `${errorMessage.slice(0, 220)}…` : errorMessage;
}

export function statusLabel(status: ProjectStatus): string {
  switch (status) {
    case 'queued':
      return 'Queued…';
    case 'processing':
      return 'Generating script, scenes & narration…';
    case 'script_ready':
      return 'Script ready — creating images…';
    case 'images_ready':
      return 'Images ready — generating voice…';
    case 'narration_ready':
      return 'Narration ready — starting video render…';
    case 'rendering':
      return 'Rendering video on cloud (FFmpeg motion + captions)…';
    case 'waiting_for_renderer':
      return 'Render failed — use Fix & retry render below';
    case 'rendered_local':
      return 'Uploading final video…';
    case 'done':
      return 'Complete!';
    case 'failed':
      return 'Something went wrong — use the recovery button on the failed step';
    default:
      return status;
  }
}

export { isProjectIncomplete } from './projectCompleteness';

export function isTerminalStatus(status: ProjectStatus): boolean {
  return status === 'done' || status === 'failed';
}

export function isThumbnailReady(status: ProjectStatus): boolean {
  return ['narration_ready', 'rendering', 'waiting_for_renderer', 'rendered_local', 'done'].includes(
    status,
  );
}

export function recoveryHint(stepId: PipelineFailedStage): string {
  switch (stepId) {
    case 'start':
      return 'Retries with captions-only or title-only extraction if yt-dlp fails.';
    case 'script':
      return 'Tell Kimi how to rewrite the Short (tone, hook, audience, topic focus).';
    case 'images':
      return 'Use neutral, family-friendly scene descriptions. Avoid brands, violence, or weapons.';
    case 'audio':
      return 'Try another voice if TTS fails or sounds wrong.';
    case 'render':
      return 'Fix applies low-memory 720p render so Render free tier does not crash.';
    default:
      return '';
  }
}

export function recoveryButtonLabel(stepId: PipelineFailedStage): string {
  switch (stepId) {
    case 'start':
      return 'Start again';
    case 'script':
      return 'Retry script';
    case 'images':
      return 'Retry images';
    case 'audio':
      return 'Retry audio';
    case 'render':
      return 'Fix & retry render';
    default:
      return 'Retry';
  }
}
