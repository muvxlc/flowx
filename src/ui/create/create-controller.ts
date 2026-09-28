import type { MediaTarget, JobMode } from '../../queue/types.ts';
import type { ReferenceAsset, ImportPreview } from '../../import/types.ts';
import { previewImport, importJobBatch } from '../../import/index.ts';
import { generatePrompt } from '../../prompts/index.ts';
import { DEFAULT_SAMPLE_REFS, DEFAULT_UNSUPPORTED_SETTINGS } from './constants.ts';
import type {
  CreatePanelState,
  EnqueueCommand,
  EnqueueCommandHandler,
  JevSimulatedRubricResult,
  TemplatePromptInput,
} from './types.ts';

export class CreateController {
  private media: MediaTarget = 'image';
  private mode: JobMode = 'text-only';
  private promptsText = '';
  private references: readonly ReferenceAsset[] = [];
  private currentRefIndex = 0;
  private isPromptHelperOpen = false;
  private jevStatus: 'idle' | 'evaluating' | 'completed' | 'error' = 'idle';
  private jevResult: JevSimulatedRubricResult | null = null;
  private validationErrors: readonly string[] = [];
  private statusMessage: string | null = null;
  private statusType: 'info' | 'success' | 'warning' | 'error' | null = null;
  private enqueueHandler: EnqueueCommandHandler | null = null;

  constructor(initialState?: Partial<CreatePanelState>) {
    if (initialState?.media) this.media = initialState.media;
    if (initialState?.mode) this.mode = initialState.mode;
    if (initialState?.promptsText !== undefined) this.promptsText = initialState.promptsText;
    if (initialState?.references) this.references = initialState.references;
  }

  public getState(): CreatePanelState {
    return {
      media: this.media,
      mode: this.mode,
      promptsText: this.promptsText,
      references: this.references,
      currentRefIndex: this.currentRefIndex,
      sampleRefs: DEFAULT_SAMPLE_REFS,
      selectedTheme: 'cinematic',
      selectedLighting: 'golden_hour',
      isPromptHelperOpen: this.isPromptHelperOpen,
      jevStatus: this.jevStatus,
      jevResult: this.jevResult,
      jevNotice:
        'Display label "Jev 1.13 Free" is strictly display-only. Gate G1 is BLOCKED; live router calls are disabled. Running local simulated rubric only.',
      unsupportedSettings: DEFAULT_UNSUPPORTED_SETTINGS,
      validationErrors: this.validationErrors,
      statusMessage: this.statusMessage,
      statusType: this.statusType,
    };
  }

  public setMedia(media: MediaTarget): void {
    this.media = media;
    this.validateCurrentState();
  }

  public setMode(mode: JobMode): void {
    this.mode = mode;
    this.validateCurrentState();
  }

  public setPromptsText(text: string): void {
    this.promptsText = text;
    this.validateCurrentState();
  }

  public setReferences(refs: readonly ReferenceAsset[]): void {
    this.references = refs;
    this.currentRefIndex = 0;
    this.validateCurrentState();
  }

  public cycleReference(): void {
    const list = this.references.length > 0 ? this.references : DEFAULT_SAMPLE_REFS;
    this.currentRefIndex = (this.currentRefIndex + 1) % list.length;
  }

  public togglePromptHelper(open?: boolean): void {
    this.isPromptHelperOpen = open !== undefined ? open : !this.isPromptHelperOpen;
  }

  public getSummaryLabel(): string {
    const mediaName = this.media === 'image' ? 'Image' : 'Video';
    const modeNames: Record<JobMode, string> = {
      'text-only': 'Text-Only (1:0)',
      'single-ref': 'Single Ref (1:N)',
      'paired-ref': 'Paired 1:1 (N:N)',
    };
    return `${mediaName} • ${modeNames[this.mode]}`;
  }

  public appendTemplatePrompt(input: TemplatePromptInput): string {
    try {
      const generated = generatePrompt({
        mediaTarget: this.media,
        theme: input.styleTheme,
        styleId: input.styleTheme,
        lightingId: input.lighting,
        seed: Math.floor(Math.random() * 100000),
      });
      const textToAppend = generated.formattedPrompt;
      this.promptsText = this.promptsText.trim()
        ? `${this.promptsText.trim()}\n${textToAppend}`
        : textToAppend;
      this.validateCurrentState();
      return textToAppend;
    } catch {
      // Fallback deterministic formatting
      const fallback = `Architectural study in ${input.styleTheme} style, illuminated by ${input.lighting}, photorealistic details`;
      this.promptsText = this.promptsText.trim()
        ? `${this.promptsText.trim()}\n${fallback}`
        : fallback;
      this.validateCurrentState();
      return fallback;
    }
  }

  public loadSamplePrompts(): void {
    this.promptsText = [
      'Ultra-detailed macro shot of raindrops on autumn maple leaf, 8k raytracing',
      'Cyberpunk street food stall vendor in rainy Neo-Tokyo, volumetric steam',
      'Cinematic portrait of Thai silk weaver in golden afternoon sunlight, shallow focus',
    ].join('\n');
    this.validateCurrentState();
  }

  public importFromTxt(rawText: string): void {
    this.promptsText = rawText;
    this.validateCurrentState();
  }

  private getEffectiveReferences(): readonly ReferenceAsset[] {
    if (this.mode === 'text-only') {
      return [];
    }
    if (this.mode === 'single-ref') {
      return this.references.slice(0, 1);
    }
    return this.references;
  }

  public getPreview(): ImportPreview {
    return previewImport({
      media: this.media,
      mode: this.mode,
      promptSource: { type: 'paste', rawText: this.promptsText },
      references: this.getEffectiveReferences(),
    });
  }

  public onEnqueue(handler: EnqueueCommandHandler): void {
    this.enqueueHandler = handler;
  }

  public async submitEnqueue(): Promise<{ success: boolean; errors: readonly string[] }> {
    const preview = this.getPreview();
    if (!preview.isValid) {
      this.validationErrors = preview.errors.map((e) => `${e.code}: ${e.message}`);
      this.statusMessage = 'Enqueue blocked: resolve validation errors first.';
      this.statusType = 'error';
      return { success: false, errors: this.validationErrors };
    }

    const importResult = importJobBatch({
      media: this.media,
      mode: this.mode,
      promptSource: { type: 'paste', rawText: this.promptsText },
      references: this.getEffectiveReferences(),
      provider: 'meta',
    });

    if (!importResult.success) {
      this.validationErrors = importResult.errors.map((e) => `${e.code}: ${e.message}`);
      return { success: false, errors: this.validationErrors };
    }

    const command: EnqueueCommand = {
      type: 'ENQUEUE_JOBS',
      media: this.media,
      mode: this.mode,
      jobs: importResult.jobs,
      preview,
    };

    if (this.enqueueHandler) {
      await this.enqueueHandler(command);
    }

    this.validationErrors = [];
    this.statusMessage = `Successfully queued ${importResult.jobs.length} jobs.`;
    this.statusType = 'success';
    return { success: true, errors: [] };
  }

  public async runSimulatedJevCheck(): Promise<JevSimulatedRubricResult> {
    const promptLines = this.promptsText
      .split('\n')
      .map((l) => l.trim())
      .filter((l) => l.length > 0);

    if (promptLines.length === 0) {
      this.jevStatus = 'error';
      throw new Error('Enter at least 1 prompt to evaluate');
    }

    this.jevStatus = 'evaluating';
    // Local deterministic simulation (10ms tick, no external network)
    await new Promise((resolve) => setTimeout(resolve, 10));

    const sampleScore = 88;
    const result: JevSimulatedRubricResult = {
      isMock: true,
      score: sampleScore,
      noul: false,
      choice: 'creative_composition',
      rubric: 'High syntactic clarity, no prompt injection detected. Local simulated rubric only.',
    };

    this.jevResult = result;
    this.jevStatus = 'completed';
    return result;
  }

  private validateCurrentState(): void {
    const preview = this.getPreview();
    if (!preview.isValid) {
      this.validationErrors = preview.errors.map((e) => e.message);
    } else {
      this.validationErrors = [];
    }
  }
}
