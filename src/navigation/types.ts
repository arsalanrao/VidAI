export type RootStackParamList = {
  Home: undefined;
  CreateProject: undefined;
  Progress: { projectId: string };
  Thumbnail: { projectId: string; thumbnailUrl: string | null; title: string | null };
  Preview: { projectId: string };
  Upload: { projectId: string; videoUrl: string | null; title: string | null };
};
