import type {
  PromptTemplateInput,
  PromptEditInput
} from '../../src/prompts/index.ts';

export const sampleImageTheme = 'Architectural study of glass conservatory';
export const sampleVideoTheme = 'Nordic coastal village under northern lights';
export const sampleThaiTheme = 'วัดอรุณราชวรารามริมแม่น้ำเจ้าพระยา';

export const validImageInput: PromptTemplateInput = {
  mediaTarget: 'image',
  theme: sampleImageTheme,
  styleId: 'cinematic',
  sceneId: 'wide_landscape',
  lightingId: 'golden_hour',
  seed: 42
};

export const validVideoInput: PromptTemplateInput = {
  mediaTarget: 'video',
  theme: sampleVideoTheme,
  styleId: 'cinematic',
  sceneId: 'aerial_drone',
  lightingId: 'dramatic',
  motionId: 'slow_pan',
  seed: 99
};

export const validThaiVideoInput: PromptTemplateInput = {
  mediaTarget: 'video',
  theme: sampleThaiTheme,
  styleId: 'thai_contemporary',
  sceneId: 'macro_detail',
  lightingId: 'studio_soft',
  motionId: 'smooth_orbit',
  seed: 12345
};

export const sampleEditInput: PromptEditInput = {
  theme: 'Futuristic glass conservatory with hydroponic flora',
  lightingId: 'neon_cyber',
  motionId: 'fps_flythrough'
};
