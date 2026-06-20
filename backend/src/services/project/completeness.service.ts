type ProjectRow = {
  status: string;
  title: string | null;
  thumbnail: string | null;
  narrationUrl: string | null;
  videoUrl: string | null;
  script: unknown;
  scenes: { imageUrl: string | null }[];
};

export type ProjectCompleteness = {
  percent: number;
  script: boolean;
  thumbnail: boolean;
  scenesDone: number;
  scenesTotal: number;
  narration: boolean;
  video: boolean;
  uploadReady: boolean;
};

export function computeCompleteness(project: ProjectRow): ProjectCompleteness {
  const script = Boolean(project.title && project.script);
  const thumbnail = Boolean(project.thumbnail);
  const scenesTotal = project.scenes.length;
  const scenesDone = project.scenes.filter((scene) => Boolean(scene.imageUrl)).length;
  const narration = Boolean(project.narrationUrl);
  const video = Boolean(project.videoUrl) || project.status === 'done';
  const uploadReady = project.status === 'done' && Boolean(project.videoUrl);

  const checks = [
    script,
    thumbnail,
    scenesTotal > 0 && scenesDone === scenesTotal,
    narration,
    video,
  ];

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
