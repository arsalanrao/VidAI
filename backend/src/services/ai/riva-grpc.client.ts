import * as grpc from '@grpc/grpc-js';
import * as protoLoader from '@grpc/proto-loader';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROTO_ROOT = resolve(__dirname, '../../../proto');

type RivaSpeechSynthesisClient = grpc.Client & {
  Synthesize: (
    request: Record<string, unknown>,
    metadata: grpc.Metadata,
    callback: grpc.requestCallback<{ audio: Buffer | Uint8Array }>,
  ) => grpc.ClientUnaryCall;
  GetRivaSynthesisConfig: (
    request: Record<string, unknown>,
    metadata: grpc.Metadata,
    callback: grpc.requestCallback<{ model_config?: Array<{ parameters?: Record<string, string> }> }>,
  ) => grpc.ClientUnaryCall;
};

let cachedClient: RivaSpeechSynthesisClient | null = null;

function loadRivaClient(server: string): RivaSpeechSynthesisClient {
  if (cachedClient) {
    return cachedClient;
  }

  const packageDefinition = protoLoader.loadSync(resolve(PROTO_ROOT, 'riva/proto/riva_tts.proto'), {
    keepCase: true,
    longs: String,
    enums: String,
    defaults: true,
    oneofs: true,
    includeDirs: [PROTO_ROOT],
  });

  const loaded = grpc.loadPackageDefinition(packageDefinition) as unknown as {
    nvidia: {
      riva: {
        tts: {
          RivaSpeechSynthesis: new (
            address: string,
            credentials: grpc.ChannelCredentials,
            options?: grpc.ClientOptions,
          ) => RivaSpeechSynthesisClient;
        };
      };
    };
  };

  cachedClient = new loaded.nvidia.riva.tts.RivaSpeechSynthesis(server, grpc.credentials.createSsl(), {
    'grpc.max_receive_message_length': 64 * 1024 * 1024,
    'grpc.max_send_message_length': 64 * 1024 * 1024,
  });

  return cachedClient;
}

export function buildNvcfMetadata(functionId: string, apiKey: string): grpc.Metadata {
  const metadata = new grpc.Metadata();
  metadata.set('function-id', functionId);
  metadata.set('authorization', `Bearer ${apiKey}`);
  return metadata;
}

export function pcmToWav(
  pcm: Buffer,
  sampleRateHz: number,
  channels = 1,
  bitsPerSample = 16,
): Buffer {
  const bytesPerSample = bitsPerSample / 8;
  const byteRate = sampleRateHz * channels * bytesPerSample;
  const blockAlign = channels * bytesPerSample;
  const dataSize = pcm.length;
  const header = Buffer.alloc(44);

  header.write('RIFF', 0);
  header.writeUInt32LE(36 + dataSize, 4);
  header.write('WAVE', 8);
  header.write('fmt ', 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRateHz, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write('data', 36);
  header.writeUInt32LE(dataSize, 40);

  return Buffer.concat([header, pcm]);
}

export async function rivaSynthesizeSpeech(options: {
  server: string;
  functionId: string;
  apiKey: string;
  text: string;
  languageCode: string;
  voiceName: string;
  sampleRateHz: number;
}): Promise<Buffer> {
  const client = loadRivaClient(options.server);
  const metadata = buildNvcfMetadata(options.functionId, options.apiKey);

  const response = await new Promise<{ audio: Buffer | Uint8Array }>((resolvePromise, reject) => {
    client.Synthesize(
      {
        text: options.text,
        language_code: options.languageCode,
        sample_rate_hz: options.sampleRateHz,
        encoding: 'LINEAR_PCM',
        voice_name: options.voiceName,
      },
      metadata,
      (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        if (!result?.audio?.length) {
          reject(new Error('Riva TTS returned empty audio'));
          return;
        }

        resolvePromise(result);
      },
    );
  });

  const pcm = Buffer.isBuffer(response.audio) ? response.audio : Buffer.from(response.audio);
  return pcmToWav(pcm, options.sampleRateHz);
}

export async function rivaListVoices(options: {
  server: string;
  functionId: string;
  apiKey: string;
}): Promise<Record<string, { voices: string[] }>> {
  const client = loadRivaClient(options.server);
  const metadata = buildNvcfMetadata(options.functionId, options.apiKey);

  const response = await new Promise<{ model_config?: Array<{ parameters?: Record<string, string> }> }>(
    (resolvePromise, reject) => {
      client.GetRivaSynthesisConfig({}, metadata, (error, result) => {
        if (error) {
          reject(error);
          return;
        }

        resolvePromise(result ?? {});
      });
    },
  );

  const voicesByLanguage: Record<string, { voices: string[] }> = {};

  for (const modelConfig of response.model_config ?? []) {
    const parameters = modelConfig.parameters ?? {};
    const languageCode = parameters.language_code;
    const voiceName = parameters.voice_name;
    const subvoices = (parameters.subvoices ?? '')
      .split(',')
      .map((voice) => voice.split(':')[0]?.trim())
      .filter(Boolean);

    if (!languageCode || !voiceName || subvoices.length === 0) {
      continue;
    }

    const fullVoiceNames = subvoices.map((subvoice) => `${voiceName}.${subvoice}`);

    if (voicesByLanguage[languageCode]) {
      voicesByLanguage[languageCode].voices.push(...fullVoiceNames);
    } else {
      voicesByLanguage[languageCode] = { voices: fullVoiceNames };
    }
  }

  return Object.fromEntries(Object.entries(voicesByLanguage).sort(([a], [b]) => a.localeCompare(b)));
}
