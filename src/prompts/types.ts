export type MediaTarget = 'image' | 'video';

export interface PromptComponentOption {
  readonly id: string;
  readonly label: string;
  readonly phrase: string;
  readonly variations?: readonly string[] | undefined;
}

export interface PromptComponents {
  readonly theme: string;
  readonly style: PromptComponentOption;
  readonly scene: PromptComponentOption;
  readonly lighting: PromptComponentOption;
  readonly motion?: PromptComponentOption | undefined;
}

export interface PromptTemplateInput {
  readonly mediaTarget: MediaTarget;
  readonly theme: string;
  readonly styleId?: string | undefined;
  readonly sceneId?: string | undefined;
  readonly lightingId?: string | undefined;
  readonly motionId?: string | undefined;
  readonly seed?: number | undefined;
  readonly customPrefix?: string | undefined;
  readonly customSuffix?: string | undefined;
}

export interface PromptEditInput {
  readonly theme?: string | undefined;
  readonly styleId?: string | undefined;
  readonly sceneId?: string | undefined;
  readonly lightingId?: string | undefined;
  readonly motionId?: string | undefined;
  readonly customPrefix?: string | undefined;
  readonly customSuffix?: string | undefined;
}

export interface PromptDraft {
  readonly id: string;
  readonly mediaTarget: MediaTarget;
  readonly formattedPrompt: string;
  readonly seed: number;
  readonly components: PromptComponents;
  readonly providerSettings: Readonly<Record<string, unknown>>;
  readonly customPrefix?: string | undefined;
  readonly customSuffix?: string | undefined;
  readonly createdAt: number;
  readonly updatedAt: number;
}

export class PromptError extends Error {
  readonly code: string;
  readonly details?: Readonly<Record<string, unknown>> | undefined;

  constructor(code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'PromptError';
    this.code = code;
    this.details = details ? Object.freeze({ ...details }) : undefined;
  }
}
