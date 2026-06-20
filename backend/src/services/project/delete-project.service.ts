import { prisma } from '../../db/client.js';
import { videoQueue } from '../../queues/video.queue.js';
import { r2Configured } from '../../config/env.js';
import { deleteObjectsWithPrefix, projectKey } from '../storage/r2.service.js';

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

export async function deleteProject(projectId: string): Promise<{
  ok: true;
  message: string;
  r2ObjectsDeleted: number;
  queueJobsRemoved: number;
}> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: { id: true, title: true },
  });

  if (!project) {
    throw new Error('Project not found');
  }

  const queueJobsRemoved = await removeQueueJobs(projectId);
  const r2ObjectsDeleted = r2Configured
    ? await deleteObjectsWithPrefix(`${projectKey(projectId)}/`)
    : 0;

  await prisma.project.delete({ where: { id: projectId } });

  const label = project.title?.trim() || 'Untitled Short';

  return {
    ok: true,
    message: `Deleted "${label}" (${r2ObjectsDeleted} cloud files, ${queueJobsRemoved} queue jobs removed)`,
    r2ObjectsDeleted,
    queueJobsRemoved,
  };
}
