import {
  PromptError,
  type PromptDraft,
  type PromptTemplateInput,
  type PromptComponents,
  type PromptComponentOption
} from './types.ts';
import {
  getStyle,
  getScene,
  getLighting,
  getMotion
} from './templates.ts';

/**
 * Deterministic pseudo-random number generator (Mulberry32).
 */
export function createPrng(seed: number): () => number {
  let s = Math.trunc(seed) >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface FormatPromptOptions {
  readonly theme: string;
  readonly stylePhrase: string;
  readonly scenePhrase: string;
  readonly lightingPhrase: string;
  readonly motionPhrase?: string | undefined;
  readonly customPrefix?: string | undefined;
  readonly customSuffix?: string | undefined;
}

export function formatPromptText(options: FormatPromptOptions): string {
  const parts: string[] = [];

  if (options.customPrefix && options.customPrefix.trim().length > 0) {
    parts.push(options.customPrefix.trim());
  }

  parts.push(options.theme.trim());
  parts.push(options.stylePhrase.trim());
  parts.push(options.scenePhrase.trim());
  parts.push(options.lightingPhrase.trim());

  if (options.motionPhrase && options.motionPhrase.trim().length > 0) {
    parts.push(options.motionPhrase.trim());
  }

  if (options.customSuffix && options.customSuffix.trim().length > 0) {
    parts.push(options.customSuffix.trim());
  }

  return parts
    .map((p) => p.replace(/^[,\s]+|[,\s]+$/g, ''))
    .filter((p) => p.length > 0)
    .join(', ');
}

function pickComponentPhrase(
  option: PromptComponentOption,
  prng: () => number
): string {
  if (!option.variations || option.variations.length === 0) {
    return option.phrase;
  }
  const idx = Math.floor(prng() * (option.variations.length + 1));
  return idx === 0 ? option.phrase : (option.variations[idx - 1] ?? option.phrase);
}

let promptCounter = 0;

export function generatePrompt(input: PromptTemplateInput): PromptDraft {
  if (!input.theme || input.theme.trim().length === 0) {
    throw new PromptError(
      'EMPTY_THEME',
      'Prompt theme cannot be empty or whitespace only.'
    );
  }

  const rawSeed = input.seed ?? 1000;
  const seed = Math.trunc(rawSeed) || 1;
  const prng = createPrng(seed);

  const styleOption = getStyle(input.styleId);
  const sceneOption = getScene(input.sceneId);
  const lightingOption = getLighting(input.lightingId);
  const motionOption = input.mediaTarget === 'video' ? getMotion(input.motionId) : undefined;

  const stylePhrase = pickComponentPhrase(styleOption, prng);
  const scenePhrase = pickComponentPhrase(sceneOption, prng);
  const lightingPhrase = pickComponentPhrase(lightingOption, prng);
  const motionPhrase = motionOption ? pickComponentPhrase(motionOption, prng) : undefined;

  const formattedPrompt = formatPromptText({
    theme: input.theme,
    stylePhrase,
    scenePhrase,
    lightingPhrase,
    motionPhrase,
    customPrefix: input.customPrefix,
    customSuffix: input.customSuffix
  });

  const components: PromptComponents = {
    theme: input.theme.trim(),
    style: Object.freeze({ ...styleOption, phrase: stylePhrase }),
    scene: Object.freeze({ ...sceneOption, phrase: scenePhrase }),
    lighting: Object.freeze({ ...lightingOption, phrase: lightingPhrase }),
    motion: motionOption
      ? Object.freeze({ ...motionOption, phrase: motionPhrase! })
      : undefined
  };

  // Safe verified provider settings: strictly compliant with JobSettings without invented keys
  const providerSettings: Record<string, unknown> =
    input.mediaTarget === 'video'
      ? { aspectRatio: '16:9', durationSeconds: 5 }
      : { aspectRatio: '1:1' };

  const now = Date.now();
  promptCounter += 1;
  const id = `prompt_${now}_${promptCounter}`;

  return {
    id,
    mediaTarget: input.mediaTarget,
    formattedPrompt,
    seed,
    components,
    providerSettings: Object.freeze(providerSettings),
    customPrefix: input.customPrefix,
    customSuffix: input.customSuffix,
    createdAt: now,
    updatedAt: now
  };
}

export function generateVariations(
  baseInput: PromptTemplateInput,
  count: number,
  startSeed?: number
): readonly PromptDraft[] {
  const result: PromptDraft[] = [];
  const baseSeed = startSeed ?? baseInput.seed ?? 1000;

  for (let i = 0; i < count; i += 1) {
    const variationSeed = baseSeed + i * 7919;
    result.push(generatePrompt({ ...baseInput, seed: variationSeed }));
  }

  return Object.freeze(result);
}
