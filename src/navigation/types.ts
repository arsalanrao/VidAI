export type RootStackParamList = {
  Home: undefined;
  Settings: undefined;
  CreateProject: undefined;
  Progress: { projectId: string };
  ProjectDetail: { projectId: string };
  Thumbnail: { projectId: string; thumbnailUrl: string | null; title: string | null };
  Preview: { projectId: string };
  Upload: { projectId: string; videoUrl: string | null; title: string | null };
};
