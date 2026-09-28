import type { PromptComponentOption } from './types.ts';

export const STYLE_OPTIONS: readonly PromptComponentOption[] = Object.freeze([
  {
    id: 'cinematic',
    label: 'Cinematic 35mm film',
    phrase: 'cinematic 35mm film aesthetic, subtle film grain, moody atmosphere',
    variations: [
      'cinematic 35mm anamorphic frame, natural film grain, atmospheric depth',
      'panavision 35mm cinematography, cinematic tone, muted highlights',
      'kodak portra 400 film aesthetic, cinematic color grading, soft falloff'
    ]
  },
  {
    id: 'minimalist',
    label: 'Minimalist Scandinavian clean',
    phrase: 'minimalist Scandinavian composition, clean lines, negative space',
    variations: [
      'ultra-minimalist Nordic aesthetic, muted neutral palette, elegant simplicity',
      'clean architectural minimalism, uncluttered framing, balanced negative space'
    ]
  },
  {
    id: 'cyberpunk',
    label: 'Cyberpunk neon rain aesthetic',
    phrase: 'cyberpunk neon atmosphere, wet asphalt reflections, retro-futuristic detailing',
    variations: [
      'dystopian cyberpunk city aesthetic, glowing holographic reflections, rain-slicked surfaces',
      'high-tech neon noir style, vibrant cyan and magenta rim lighting'
    ]
  },
  {
    id: 'thai_contemporary',
    label: 'Contemporary Thai modern',
    phrase: 'contemporary Thai aesthetic, refined traditional motifs blended with modern design',
    variations: [
      'modern Thai cultural atmosphere, intricate gilded elements, warm tropical ambient tones',
      'refined contemporary Thai elegance, subtle lotus and teakwood accents'
    ]
  },
  {
    id: 'photorealistic',
    label: 'Photorealistic 8k capture',
    phrase: 'photorealistic 8k resolution, authentic material textures, natural optics',
    variations: [
      'masterpiece National Geographic photography, pin-sharp optical clarity, raw texture',
      'hyper-realistic Hasselblad medium format capture, true-to-life surface details'
    ]
  },
  {
    id: 'anime_art',
    label: 'Stylized anime concept art',
    phrase: 'Japanese anime feature animation art style, vibrant painted backgrounds',
    variations: [
      'makoto shinkai inspired anime aesthetic, luminous cloudscape, rich vibrant hues',
      'classic studio keyframe anime illustration, hand-drawn detailing'
    ]
  }
]);

export const SCENE_OPTIONS: readonly PromptComponentOption[] = Object.freeze([
  {
    id: 'wide_landscape',
    label: 'Wide panoramic environment',
    phrase: 'wide panoramic angle, expansive horizon, environmental scale',
    variations: [
      'sweeping wide-angle vista, grand sense of scale, environmental depth',
      'cinematic wide establishing shot, vast landscape vista'
    ]
  },
  {
    id: 'close_up_portrait',
    label: 'Close-up detailed focus',
    phrase: 'intimate close-up perspective, sharp focal subject, subtle bokeh background',
    variations: [
      'tight detailed framing, shallow depth of field, focused subject emphasis',
      'medium close-up frame, crisp foreground details, gentle background blur'
    ]
  },
  {
    id: 'aerial_drone',
    label: 'Aerial drone perspective',
    phrase: 'elevated drone overview, top-down perspective, geometric layout',
    variations: [
      'high-altitude aerial survey, sweeping vertical vantage point',
      'bird-eye drone angle, expansive spatial layout'
    ]
  },
  {
    id: 'macro_detail',
    label: 'Macro texture detail',
    phrase: 'extreme macro photography, microscopic surface textures, selective focus',
    variations: [
      'ultra-close macro lens framing, intricate micro-patterns, razor-thin depth of field',
      'magnified surface detail, crisp tactile texture rendering'
    ]
  },
  {
    id: 'architectural_exterior',
    label: 'Architectural exterior study',
    phrase: 'architectural structural study, two-point perspective, geometric precision',
    variations: [
      'formal architectural elevation, balanced symmetrical framing, structural harmony',
      'dynamic corner angle architectural view, dramatic vertical vanishing points'
    ]
  }
]);

export const LIGHTING_OPTIONS: readonly PromptComponentOption[] = Object.freeze([
  {
    id: 'golden_hour',
    label: 'Golden hour warm glow',
    phrase: 'warm golden hour sunlight, long soft shadows, amber rim lighting',
    variations: [
      'late afternoon sunbeams, rich golden atmospheric haze, warm edge highlights',
      'dusk golden hour radiance, soft warm glow illuminating the scene'
    ]
  },
  {
    id: 'studio_soft',
    label: 'Studio softbox diffusion',
    phrase: 'diffused studio softbox lighting, gentle gradient shadows, balanced exposure',
    variations: [
      'commercial studio lighting setup, wrap-around soft illumination, zero harsh shadows',
      'calibrated three-point studio lighting, subtle key light, smooth ambient fill'
    ]
  },
  {
    id: 'dramatic',
    label: 'High-contrast chiaroscuro',
    phrase: 'dramatic chiaroscuro lighting, deep cavernous shadows, striking directional beam',
    variations: [
      'theatrical high-contrast key light, deep noir shadows, intense spotlight accent',
      'moody rim light piercing deep darkness, cinematic shadow play'
    ]
  },
  {
    id: 'neon_cyber',
    label: 'Vivid neon illumination',
    phrase: 'vibrant neon glow, dual-tone cyan and magenta light sources, colored reflections',
    variations: [
      'saturated neon backlight, electric ultraviolet highlights, chromatic glare',
      'multi-colored neon signage spill, reflective wet surfaces'
    ]
  },
  {
    id: 'overcast_natural',
    label: 'Natural overcast daylight',
    phrase: 'soft natural overcast daylight, gentle ambient illumination, neutral temperature',
    variations: [
      'misty morning overcast light, cool neutral color tones, uniform soft diffusion',
      'cloudy sky ambient lighting, natural color fidelity, matte textures'
    ]
  }
]);

export const MOTION_OPTIONS: readonly PromptComponentOption[] = Object.freeze([
  {
    id: 'slow_pan',
    label: 'Slow horizontal camera pan',
    phrase: 'slow horizontal camera pan, steady cinematic tracking motion',
    variations: [
      'graceful left-to-right camera pan, fluid stabilized motion at 24fps',
      'gentle panoramic sweeping motion, cinematic slow camera movement'
    ]
  },
  {
    id: 'smooth_orbit',
    label: 'Seamless orbital rotation',
    phrase: 'seamless 360-degree orbital camera rotation around central subject',
    variations: [
      'concentric rotational camera arc, fluid parallax displacement',
      'slow orbital steady-cam glide, smooth perspective shift'
    ]
  },
  {
    id: 'fps_flythrough',
    label: 'Fluid first-person flythrough',
    phrase: 'first-person continuous forward flythrough, fluid motion blur',
    variations: [
      'smooth FPV drone flythrough gliding through the environment',
      'steady forward dolly push traversing into the scene'
    ]
  },
  {
    id: 'dynamic_zoom',
    label: 'Cinematic push-in zoom',
    phrase: 'slow cinematic push-in zoom, increasing focal intensity',
    variations: [
      'smooth slow-motion optical zoom converging on key detail',
      'gradual dolly-in camera zoom with subtle vertigo parallax'
    ]
  },
  {
    id: 'static_lock',
    label: 'Stable locked-off frame',
    phrase: 'locked-off stationary tripod composition, natural internal scene motion',
    variations: [
      'completely static camera frame with subtle environmental movement inside scene',
      'immobile fixed vantage point capturing organic atmospheric dynamics'
    ]
  }
]);

export function getStyle(id?: string): PromptComponentOption {
  const found = id ? STYLE_OPTIONS.find((s) => s.id === id) : undefined;
  return found ?? STYLE_OPTIONS[0]!;
}

export function getScene(id?: string): PromptComponentOption {
  const found = id ? SCENE_OPTIONS.find((s) => s.id === id) : undefined;
  return found ?? SCENE_OPTIONS[0]!;
}

export function getLighting(id?: string): PromptComponentOption {
  const found = id ? LIGHTING_OPTIONS.find((s) => s.id === id) : undefined;
  return found ?? LIGHTING_OPTIONS[0]!;
}

export function getMotion(id?: string): PromptComponentOption {
  const found = id ? MOTION_OPTIONS.find((s) => s.id === id) : undefined;
  return found ?? MOTION_OPTIONS[0]!;
}

export function getAvailableStyles(): readonly PromptComponentOption[] {
  return STYLE_OPTIONS;
}

export function getAvailableScenes(): readonly PromptComponentOption[] {
  return SCENE_OPTIONS;
}

export function getAvailableLightings(): readonly PromptComponentOption[] {
  return LIGHTING_OPTIONS;
}

export function getAvailableMotions(): readonly PromptComponentOption[] {
  return MOTION_OPTIONS;
}
