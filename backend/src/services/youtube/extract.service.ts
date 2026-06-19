import { YoutubeTranscript } from 'youtube-transcript-plus';

export type YouTubeExtract = {
  videoId: string;
  title: string;
  transcript: string;
};

const VIDEO_ID_PATTERNS = [
  /(?:youtube\.com\/watch\?.*v=)([a-zA-Z0-9_-]{11})/,
  /(?:youtu\.be\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/shorts\/)([a-zA-Z0-9_-]{11})/,
  /(?:youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
];

export function parseYouTubeVideoId(url: string): string | null {
  for (const pattern of VIDEO_ID_PATTERNS) {
    const match = url.match(pattern);
    if (match?.[1]) {
      return match[1];
    }
  }

  return null;
}

async function fetchVideoTitle(url: string): Promise<string> {
  const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(url)}&format=json`;
  const response = await fetch(oembedUrl);

  if (!response.ok) {
    throw new Error(`Could not fetch YouTube title (${response.status})`);
  }

  const data = (await response.json()) as { title?: string };
  return data.title?.trim() || 'Untitled YouTube video';
}

async function fetchTranscript(videoId: string): Promise<string> {
  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' });
    const text = segments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length >= 20) {
      return text;
    }
  } catch {
    // Try auto-generated captions in any language below.
  }

  try {
    const segments = await YoutubeTranscript.fetchTranscript(videoId);
    const text = segments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (text.length >= 20) {
      return text;
    }
  } catch {
    // Fall through to error.
  }

  throw new Error(
    'No usable transcript found for this video. Try a public video with captions or auto-generated subtitles.',
  );
}

export async function extractYouTubeSource(youtubeUrl: string): Promise<YouTubeExtract> {
  const videoId = parseYouTubeVideoId(youtubeUrl);

  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  const [title, transcript] = await Promise.all([
    fetchVideoTitle(youtubeUrl),
    fetchTranscript(videoId),
  ]);

  return { videoId, title, transcript };
}
