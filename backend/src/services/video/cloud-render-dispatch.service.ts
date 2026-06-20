import { prisma } from '../../db/client.js';
import { videoQueue } from '../../queues/video.queue.js';
import { r2Configured } from '../../config/env.js';

const STALE_RENDERING_MS = 15 * 60 * 1000;

export type CloudRenderQueueResult = {
  ok: boolean;
  status?: string;
  message: string;
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

async function clearCloudRenderJob(projectId: string, force = false): Promise<void> {
  const jobId = `cloud-render-${projectId}`;
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
    // already removed
  }
}

export async function validateProjectForCloudRender(projectId: string): Promise<{
  ok: boolean;
  message: string;
}> {
  if (!r2Configured) {
    return { ok: false, message: 'R2 not configured — cannot render or store video' };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { order: 'asc' } } },
  });

  if (!project) {
    return { ok: false, message: `Project not found: ${projectId}` };
  }

  if (!project.narrationUrl) {
    return { ok: false, message: 'Narration missing — wait for TTS or retry pipeline' };
  }

  const missingImages = project.scenes.filter((scene) => !scene.imageUrl);
  if (missingImages.length) {
    return { ok: false, message: 'Some scenes are missing images' };
  }

  return { ok: true, message: 'Ready for cloud FFmpeg render' };
}

export async function queueCloudRender(
  projectId: string,
  options?: { force?: boolean },
): Promise<CloudRenderQueueResult> {
  const validation = await validateProjectForCloudRender(projectId);
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
    return { ok: false, status: 'done', message: 'Project already complete' };
  }

  if (!RESUMABLE_RENDER_STATUSES.has(project.status)) {
    if (project.status === 'processing' || project.status === 'queued') {
      return {
        ok: false,
        status: project.status,
        message: 'Still generating script, images, and narration — wait for render step',
      };
    }

    return {
      ok: false,
      status: project.status,
      message: `Project is not ready for render (status: ${project.status})`,
    };
  }

  const stale = isStaleRendering(project.status, project.updatedAt);
  const force = options?.force === true;

  if (project.status === 'rendering' && !force && !stale) {
    const existing = await videoQueue.getJob(`cloud-render-${projectId}`);
    const state = existing ? await existing.getState() : null;

    if (state === 'active' || state === 'waiting') {
      return {
        ok: true,
        status: 'rendering',
        message: 'Cloud render already in progress',
      };
    }
  }

  if (force || stale) {
    await clearCloudRenderJob(projectId, true);
  }

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'rendering', errorMessage: null },
  });

  try {
    await videoQueue.add(
      'cloud-render',
      { projectId },
      {
        jobId: `cloud-render-${projectId}`,
        removeOnComplete: true,
        removeOnFail: 100,
      },
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to queue cloud render';

    if (message.toLowerCase().includes('job') && message.toLowerCase().includes('exist')) {
      return { ok: true, status: 'rendering', message: 'Cloud render job already queued' };
    }

    await prisma.project.update({
      where: { id: projectId },
      data: { status: 'waiting_for_renderer', errorMessage: message },
    });

    return { ok: false, status: 'waiting_for_renderer', message };
  }

  return {
    ok: true,
    status: 'rendering',
    message: 'Cloud FFmpeg render queued — motion, captions, and merge on Render',
  };
}
