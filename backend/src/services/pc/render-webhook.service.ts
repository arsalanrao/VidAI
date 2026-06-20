import { prisma } from '../../db/client.js';
import { getSignedUploadUrl, projectKey } from '../storage/r2.service.js';
import { r2Configured } from '../../config/env.js';

export type RenderCompleteResult = {
  ok: boolean;
  message: string;
  projectId?: string;
  status?: string;
  videoKey?: string;
};

export async function completeProjectRender(
  projectId: string,
  videoKey: string,
): Promise<RenderCompleteResult> {
  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    return { ok: false, message: `Project not found: ${projectId}` };
  }

  await prisma.project.update({
    where: { id: projectId },
    data: {
      status: 'done',
      videoUrl: videoKey,
      errorMessage: null,
    },
  });

  return {
    ok: true,
    message: 'Final video saved — project complete',
    projectId,
    status: 'done',
    videoKey,
  };
}

export async function requestVideoUploadUrl(projectId: string): Promise<{
  ok: boolean;
  message: string;
  projectId?: string;
  videoKey?: string;
  uploadUrl?: string;
}> {
  if (!r2Configured) {
    return { ok: false, message: 'R2 not configured on server' };
  }

  const project = await prisma.project.findUnique({ where: { id: projectId } });

  if (!project) {
    return { ok: false, message: `Project not found: ${projectId}` };
  }

  const videoKey = projectKey(projectId, 'final.mp4');
  const uploadUrl = await getSignedUploadUrl(videoKey, 'video/mp4', 60 * 60);

  return {
    ok: true,
    message: 'Presigned upload URL issued',
    projectId,
    videoKey,
    uploadUrl,
  };
}
