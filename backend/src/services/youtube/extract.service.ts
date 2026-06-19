import { YoutubeTranscript } from 'youtube-transcript-plus';
import { extractViaYtDlp } from './ytdlp.service.js';

export type YouTubeExtract = {
  videoId: string;
  title: string;
  transcript: string;
  transcriptSource: 'captions' | 'description';
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

function joinSegments(segments: Array<{ text: string }>): string {
  return segments
    .map((segment) => segment.text.trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim();
}

async function fetchTranscriptViaLibrary(videoId: string): Promise<string | null> {
  const attempts = [
    () => YoutubeTranscript.fetchTranscript(videoId, { lang: 'en' }),
    () => YoutubeTranscript.fetchTranscript(videoId),
  ];

  for (const attempt of attempts) {
    try {
      const text = joinSegments(await attempt());
      if (text.length >= 20) {
        return text;
      }
    } catch {
      // Try next method.
    }
  }

  return null;
}

export async function extractYouTubeSource(youtubeUrl: string): Promise<YouTubeExtract> {
  const videoId = parseYouTubeVideoId(youtubeUrl);

  if (!videoId) {
    throw new Error('Invalid YouTube URL');
  }

  const ytdlpResult = await extractViaYtDlp(youtubeUrl);

  if (ytdlpResult.ok) {
    return {
      videoId,
      title: ytdlpResult.title,
      transcript: ytdlpResult.transcript,
      transcriptSource: ytdlpResult.source,
    };
  }

  const [title, libraryTranscript] = await Promise.all([
    fetchVideoTitle(youtubeUrl),
    fetchTranscriptViaLibrary(videoId),
  ]);

  if (libraryTranscript) {
    return {
      videoId,
      title,
      transcript: libraryTranscript,
      transcriptSource: 'captions',
    };
  }

  throw new Error(
    `Transcript extraction failed. ${ytdlpResult.reason}. Caption library also failed (YouTube often blocks cloud servers).`,
  );
}
