import { env } from '../../config/env.js';
import { prisma } from '../../db/client.js';
import { getSignedObjectUrl } from '../storage/r2.service.js';

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

export async function dispatchProjectRender(projectId: string): Promise<PcDispatchResult> {
  if (!pcRendererConfigured) {
    return {
      ok: false,
      message: 'PC renderer not configured — set PC_SERVER_URL and PC_API_SECRET',
    };
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

  await prisma.project.update({
    where: { id: projectId },
    data: { status: 'rendering', errorMessage: null },
  });

  const payload = {
    project_id: projectId,
    narration_url: await getSignedObjectUrl(project.narrationUrl),
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

    await prisma.project.update({
      where: { id: projectId },
      data: {
        status: 'rendered_local',
        errorMessage: null,
      },
    });

    return {
      ok: true,
      message: 'PC finished rendering — Step 15 will upload final MP4 to R2',
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
