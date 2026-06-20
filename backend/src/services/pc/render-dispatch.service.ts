import { prisma } from '../../db/client.js';
import { videoQueue } from '../../queues/video.queue.js';
import { checkPcHealth, pcRendererConfigured, validateProjectForRender } from './pc-render.service.js';

const STALE_RENDERING_MS = 15 * 60 * 1000;

export type RenderQueueResult = {
  ok: boolean;
  status?: string;
  message: string;
  pcOnline?: boolean;
};

export const RESUMABLE_RENDER_STATUSES = new Set([
  'waiting_for_renderer',
  'narration_ready',
  'images_ready',
  'rendering',
  'rendered_local',
]);

function isStaleRendering(status: string, updatedAt: Date): boolean {
  return status === 'rendering' && Date.now() - updatedAt.getTime() > STALE_RENDERING_MS;
}

async function clearRenderJob(projectId: string, force = false): Promise<void> {
  const jobId = `render-${projectId}`;
  const existing = await videoQueue.getJob(jobId);

  if (!existing) {
    return;
  }

  const state = await existing.getState();

  if (state === 'active' && !force) {
    return;
  }

  try {
    await existing.remove();
  } catch {
    // job may have been removed by another worker
  }
}

export async function queueProjectRender(
  projectId: string,
  options?: { force?: boolean },
): Promise<RenderQueueResult> {
  if (!pcRendererConfigured) {
    return {
      ok: false,
      message: 'PC renderer not configured on server',
      pcOnline: false,
    };
  }

  const validation = await validateProjectForRender(projectId);
  if (!validation.ok) {
    return { ok: false, message: validation.message };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { status: true, updatedAt: true },
  });

  if (!project) {
    return { ok: false, message: `Project not found: ${projectId}` };
  }

  if (project.status === 'done') {
    return { ok: false, message: 'Project already complete', status: 'done' };
  }

  if (!RESUMABLE_RENDER_STATUSES.has(project.status)) {
    if (project.status === 'processing' || project.status === 'queued') {
      return {
        ok: false,
        message: 'Still generating script, images, and narration on the cloud — wait for the PC render step',
        status: project.status,
      };
    }

    return {
      ok: false,
      message: `Project is not ready for PC render (status: ${project.status})`,
      status: project.status,
    };
  }

  const stale = isStaleRendering(project.status, project.updatedAt);
  const force = options?.force === true;

  if (project.status === 'rendering' && !force && !stale) {
    const existing = await videoQueue.getJob(`render-${projectId}`);
    const state = existing ? await existing.getState() : null;

    if (state === 'active' || state === 'waiting') {
      return {
        ok: true,
        status: 'rendering',
        message: 'Render already in progress on your PC',
        pcOnline: true,
      };
    }
  }

  const health = await checkPcHealth();
  if (!health.ok) {
    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'waiting_for_renderer',
        errorMessage: health.message,
      },
    });

    return {
      ok: false,
      status: 'waiting_for_renderer',
      message: health.message,
      pcOnline: false,
    };
  }

  if (force || stale) {
    await clearRenderJob(projectId, true);
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'rendering', errorMessage: null },
  });

  try {
    await videoQueue.add(
      'dispatch-render',
      { projectId },
      {
        jobId: `render-${projectId}`,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to queue render job';

    if (message.toLowerCase().includes('job') && message.toLowerCase().includes('exist')) {
      return {
        ok: true,
        status: 'rendering',
        message: 'Render job already queued',
        pcOnline: true,
      };
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'waiting_for_renderer', errorMessage: message },
    });

    return { ok: false, status: 'waiting_for_renderer', message, pcOnline: true };
  }

  return {
    ok: true,
    status: 'rendering',
    message:
      'PC render resumed — completed scenes on your PC are reused, only missing clips are rendered',
    pcOnline: true,
  };
}
