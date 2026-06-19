import { YoutubeTranscript } from 'youtube-transcript-plus';
import { extractViaYtDlp } from './ytdlp.service.js';

export type YouTubeExtract = {
  videoId: string;
  title: string;
  transcript: string;
  transcriptSource: 'captions' | 'description' | 'title';
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

async function fetchTimedText(videoId: string): Promise<string | null> {
  const urls = [
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=vtt`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&kind=asr&fmt=vtt`,
    `https://www.youtube.com/api/timedtext?v=${videoId}&lang=en&fmt=srv3`,
  ];

  for (const url of urls) {
    try {
      const response = await fetch(url, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        },
      });

      if (!response.ok) {
        continue;
      }

      const raw = await response.text();
      const text = url.includes('fmt=srv3')
        ? raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
        : raw
            .split('\n')
            .filter((line) => line.trim() && !line.includes('-->') && !line.startsWith('WEBVTT'))
            .join(' ')
            .replace(/\s+/g, ' ')
            .trim();

      if (text.length >= 20) {
        return text;
      }
    } catch {
      // Try next URL.
    }
  }

  return null;
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

  const ytdlpResult = await extractViaYtDlp(youtubeUrl, videoId);

  if (ytdlpResult.ok) {
    return {
      videoId,
      title: ytdlpResult.title,
      transcript: ytdlpResult.transcript,
      transcriptSource: ytdlpResult.source,
    };
  }

  const [title, timedText, libraryTranscript] = await Promise.all([
    fetchVideoTitle(youtubeUrl),
    fetchTimedText(videoId),
    fetchTranscriptViaLibrary(videoId),
  ]);

  const fallbackTranscript = timedText || libraryTranscript;

  if (fallbackTranscript) {
    return {
      videoId,
      title,
      transcript: fallbackTranscript,
      transcriptSource: 'captions',
    };
  }

  return {
    videoId,
    title,
    transcript: `Create a viral YouTube Short inspired by this topic.\nVideo title: ${title}`,
    transcriptSource: 'title',
  };
}
