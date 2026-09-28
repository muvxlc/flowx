import type { ReferenceAsset } from '../../import/types.ts';
import type { UnsupportedSettingsMap } from './types.ts';

export const DEFAULT_SAMPLE_REFS: readonly ReferenceAsset[] = Object.freeze([
  {
    id: 'ref_portrait_cyber_01',
    name: 'portrait_cyber_01.png',
    mimeType: 'image/png',
    sizeBytes: 1468006,
  },
  {
    id: 'ref_landscape_golden_02',
    name: 'landscape_golden_02.png',
    mimeType: 'image/png',
    sizeBytes: 2097152,
  },
  {
    id: 'ref_lotus_temple_03',
    name: 'lotus_temple_03.png',
    mimeType: 'image/png',
    sizeBytes: 1887436,
  },
]);

export const DEFAULT_UNSUPPORTED_SETTINGS: UnsupportedSettingsMap = Object.freeze({
  customNegativePrompt: {
    id: 'customNegativePrompt',
    label: 'Custom Negative Prompt',
    disabled: true as const,
    reason: 'Unsupported upstream in current Meta AI web interface. Disabled to prevent silent failure.',
  },
  videoAspectRatioOverride: {
    id: 'videoAspectRatioOverride',
    label: 'Video Aspect Ratio Override',
    disabled: true as const,
    reason: 'Meta AI video generation enforces default canvas ratio; parameter override rejected upstream.',
  },
  customSeed: {
    id: 'customSeed',
    label: 'Custom Generation Seed',
    disabled: true as const,
    reason: 'Meta AI web interface does not expose manual RNG seed input control.',
  },
  highResUpscale: {
    id: 'highResUpscale',
    label: 'High-Res Upscale Parameter',
    disabled: true as const,
    reason: 'Upstream resolution is fixed per media mode; manual upscale toggle is not exposed.',
  },
});
