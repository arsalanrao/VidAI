import { prisma } from '../../db/client.js';
import { videoQueue } from '../../queues/video.queue.js';
import { r2Configured } from '../../config/env.js';
import { deleteObject, deleteObjectsWithPrefix, projectKey } from '../storage/r2.service.js';

function collectStoredKeys(project: {
  thumbnail: string | null;
  videoUrl: string | null;
  narrationUrl: string | null;
  scenes: Array<{ imageUrl: string | null; imageUrls: unknown; videoUrl: string | null }>;
}): string[] {
  const keys = new Set<string>();

  for (const value of [project.thumbnail, project.videoUrl, project.narrationUrl]) {
    if (value?.trim()) {
      keys.add(value.trim());
    }
  }

  for (const scene of project.scenes) {
    if (scene.imageUrl?.trim()) {
      keys.add(scene.imageUrl.trim());
    }

    if (scene.videoUrl?.trim()) {
      keys.add(scene.videoUrl.trim());
    }

    if (Array.isArray(scene.imageUrls)) {
      for (const key of scene.imageUrls) {
        if (typeof key === 'string' && key.trim()) {
          keys.add(key.trim());
        }
      }
    }
  }

  return [...keys];
}

async function removeQueueJobs(projectId: string): Promise<number> {
  const knownJobIds = [`process-${projectId}`, `cloud-render-${projectId}`];
  let removed = 0;

  for (const jobId of knownJobIds) {
    const job = await videoQueue.getJob(jobId);

    if (job) {
      await job.remove();
      removed += 1;
    }
  }

  const states = ['waiting', 'active', 'delayed', 'paused', 'prioritized'] as const;

  for (const state of states) {
    const jobs = await videoQueue.getJobs([state], 0, 200);

    for (const job of jobs) {
      const data = job.data as { projectId?: string };

      if (data.projectId === projectId) {
        await job.remove();
        removed += 1;
      }
    }
  }

  return removed;
}

async function deleteProjectStorage(projectId: string, explicitKeys: string[]): Promise<number> {
  if (!r2Configured) {
    return 0;
  }

  const deleted = new Set<string>();

  for (const key of explicitKeys) {
    try {
      await deleteObject(key);
      deleted.add(key);
    } catch (err) {
      console.warn(`[delete] could not remove R2 object ${key}:`, err);
    }
  }

  const prefixDeleted = await deleteObjectsWithPrefix(`${projectKey(projectId)}/`);

  return deleted.size + prefixDeleted;
}

export async function deleteProject(projectId: string): Promise<{
  ok: true;
  message: string;
  r2ObjectsDeleted: number;
  queueJobsRemoved: number;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: true },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const queueJobsRemoved = await removeQueueJobs(projectId);
  const explicitKeys = collectStoredKeys(project);
  const r2ObjectsDeleted = await deleteProjectStorage(projectId, explicitKeys);

  await prisma.project.delete({ where: { id: projectId } });

  const label = project.title?.trim() || 'Untitled Short';

  return {
    ok: true,
    message: `Deleted "${label}" — removed ${r2ObjectsDeleted} cloud file(s) and ${queueJobsRemoved} queue job(s)`,
    r2ObjectsDeleted,
    queueJobsRemoved,
  };
}
