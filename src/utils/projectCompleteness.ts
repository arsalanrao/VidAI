import type { ProjectCompleteness, ProjectResult, ProjectStatus } from '../types/project';

export function computeCompletenessFromResult(project: ProjectResult): ProjectCompleteness {
  if (project.completeness) {
    return project.completeness;
  }

  const script = Boolean(project.title);
  const thumbnail = Boolean(project.thumbnail);
  const scenesTotal = project.scenes.length;
  const scenesDone = project.scenes.filter((scene) => scene.complete ?? Boolean(scene.imageUrl)).length;
  const narration = Boolean(project.narrationUrl);
  const video = Boolean(project.videoUrl) || project.status === 'done';
  const uploadReady = project.status === 'done' && Boolean(project.videoUrl);

  const checks = [script, thumbnail, scenesTotal > 0 && scenesDone === scenesTotal, narration, video];
  const percent = Math.round((checks.filter(Boolean).length / checks.length) * 100);

  return {
    percent,
    script,
    thumbnail,
    scenesDone,
    scenesTotal,
    narration,
    video,
    uploadReady,
  };
}

export type CompletenessStep = {
  id: string;
  label: string;
  done: boolean;
  detail?: string;
};

export function completenessSteps(project: ProjectResult): CompletenessStep[] {
  const c = computeCompletenessFromResult(project);

  return [
    { id: 'script', label: 'Script & title', done: c.script },
    {
      id: 'thumbnail',
      label: 'Thumbnail',
      done: c.thumbnail,
    },
    {
      id: 'scenes',
      label: 'Scene images',
      done: c.scenesTotal > 0 && c.scenesDone === c.scenesTotal,
      detail: `${c.scenesDone}/${c.scenesTotal}`,
    },
    { id: 'narration', label: 'Voice narration', done: c.narration },
    { id: 'video', label: 'PC video render', done: c.video },
    { id: 'upload', label: 'Ready to upload', done: c.uploadReady },
  ];
}

export function isProjectComplete(status: ProjectStatus): boolean {
  return status === 'done';
}

export function isProjectIncomplete(status: ProjectStatus): boolean {
  return status !== 'done';
}
