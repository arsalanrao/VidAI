import { env, r2Configured } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { getSignedObjectUrl, getSignedUploadUrl, projectKey } from '../storage/r2.service.js';
import { completeProjectRender } from './render-webhook.service.js';

const PC_HEALTH_TIMEOUT_MS = 15_000;
const PC_RENDER_TIMEOUT_MS = 45 * 60 * 1000;

export type PcHealthResult = {
  ok: boolean;
  configured: boolean;
  message: string;
  pc?: Record<string, unknown>;
};

export type PcDispatchResult = {
  ok: boolean;
  message: string;
  pcResponse?: Record<string, unknown>;
};

export const pcRendererConfigured =
  Boolean(env.pcServerUrl.trim()) && Boolean(env.pcApiSecret.trim());

function apiPublicUrl(): string {
  return env.apiPublicUrl.replace(/\/$/, '');
}

function pcBaseUrl(): string {
  return env.pcServerUrl.replace(/\/$/, '');
}

function pcHeaders(): Record<string, string> {
  return {
    'X-Api-Secret': env.pcApiSecret,
    'Content-Type': 'application/json',
  };
}

async function readJsonResponse(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();

  if (!text) {
    return {};
  }

  try {
    return JSON.parse(text) as Record<string, unknown>;
  } catch {
    return { raw: text };
  }
}

export async function checkPcHealth(): Promise<PcHealthResult> {
  if (!pcRendererConfigured) {
    return {
      ok: false,
      configured: false,
      message: 'Set PC_SERVER_URL and PC_API_SECRET on Render (and ai-server/.env)',
    };
  }

  try {
    const response = await fetch(`${pcBaseUrl()}/health/authenticated`, {
      headers: pcHeaders(),
      signal: AbortSignal.timeout(PC_HEALTH_TIMEOUT_MS),
    });

    const body = await readJsonResponse(response);

    if (!response.ok) {
      return {
        ok: false,
        configured: true,
        message: String(body.detail ?? body.message ?? `PC health returned HTTP ${response.status}`),
        pc: body,
      };
    }

    return {
      ok: true,
      configured: true,
      message: 'PC renderer reachable with valid API secret',
      pc: body,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PC health check failed';

    return {
      ok: false,
      configured: true,
      message,
    };
  }
}

export async function validateProjectForRender(projectId: string): Promise<PcDispatchResult> {
  if (!pcRendererConfigured) {
    return {
      ok: false,
      message: 'PC renderer not configured — set PC_SERVER_URL and PC_API_SECRET',
    };
  }

  if (!r2Configured) {
    return { ok: false, message: 'R2 not configured — cannot store final video' };
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { order: 'asc' } } },
  });

  if (!project) {
    return { ok: false, message: `Project not found: ${projectId}` };
  }

  if (!project.scenes.length) {
    return { ok: false, message: 'Project has no scenes to render' };
  }

  if (!project.narrationUrl) {
    return { ok: false, message: 'Project has no narration — run TTS stage first' };
  }

  const missingImages = project.scenes.filter((scene) => !scene.imageUrl);
  if (missingImages.length) {
    return { ok: false, message: 'Some scenes are missing images' };
  }

  return { ok: true, message: 'Project is ready for PC render' };
}

export async function executeProjectRender(projectId: string): Promise<PcDispatchResult> {
  const validation = await validateProjectForRender(projectId);
  if (!validation.ok) {
    return validation;
  }

  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { scenes: { orderBy: { order: 'asc' } } },
  });

  if (!project) {
    return { ok: false, message: `Project not found: ${projectId}` };
  }

  const videoKey = projectKey(projectId, 'final.mp4');
  const videoUploadUrl = await getSignedUploadUrl(videoKey, 'video/mp4', 60 * 60 * 2);
  const callbackUrl = `${apiPublicUrl()}/api/webhooks/render-complete`;

  const payload = {
    project_id: projectId,
    narration_url: await getSignedObjectUrl(project.narrationUrl!),
    video_key: videoKey,
    video_upload_url: videoUploadUrl,
    callback_url: callbackUrl,
    scenes: await Promise.all(
      project.scenes.map(async (scene) => ({
        order: scene.order,
        image_url: await getSignedObjectUrl(scene.imageUrl!),
        duration: scene.duration,
      })),
    ),
  };

  try {
    const response = await fetch(`${pcBaseUrl()}/render/project`, {
      method: 'POST',
      headers: pcHeaders(),
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(PC_RENDER_TIMEOUT_MS),
    });

    const body = await readJsonResponse(response);

    if (!response.ok) {
      await prisma.project.update({
        where: { id: projectId },
        data: {
          status: 'waiting_for_renderer',
          errorMessage: String(body.detail ?? body.message ?? `PC render failed (HTTP ${response.status})`),
        },
      });

      return {
        ok: false,
        message: String(body.detail ?? body.message ?? `PC render failed (HTTP ${response.status})`),
        pcResponse: body,
      };
    }

    const resolvedVideoKey = String(body.video_key ?? videoKey);
    await completeProjectRender(projectId, resolvedVideoKey);

    return {
      ok: true,
      message: 'Final video uploaded to R2 — project complete',
      pcResponse: body,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'PC render dispatch failed';

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'waiting_for_renderer',
        errorMessage: message,
      },
    });

    return { ok: false, message };
  }
}
