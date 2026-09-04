import { arch, release } from 'node:os';

const labels = {
  darwin: 'macOS',
  linux: 'Linux',
  win32: 'Windows',
};

export function buildCapabilities(platform = process.platform) {
  return {
    edition: 'core',
    maturity: 'preview',
    platform,
    platformLabel: labels[platform] || platform,
    architecture: arch(),
    osRelease: release(),
    features: {
      dashboard: { state: 'available' },
      remoteChat: { state: 'available' },
      personas: { state: 'available' },
      localApi: { state: 'available' },
      localInference: { state: 'planned', reason: 'A standard llama.cpp capability pack is planned.' },
      memory: { state: 'planned', reason: 'Persistent FTS memory will ship as a core migration-safe module.' },
      channels: { state: 'planned', reason: 'Messaging adapters will be optional capability packs.' },
      audio: { state: 'planned', reason: 'Audio and TTS are not included in Core Preview.' },
      song: { state: 'planned', reason: 'Song workflows are not included in Core Preview.' },
      video: { state: 'planned', reason: 'ComfyUI and video generation are not included in Core Preview.' },
      virtualMic: { state: 'planned', reason: 'Virtual audio routing requires an OS-specific capability pack.' },
      mlx: {
        state: platform === 'darwin' ? 'planned' : 'unavailable',
        reason: platform === 'darwin' ? 'MLX is not bundled with Core Preview.' : 'The Windows/Linux roadmap does not depend on MLX.',
      },
    },
    network: {
      loopbackOnly: true,
      lanControl: false,
      tls: false,
    },
  };
}
