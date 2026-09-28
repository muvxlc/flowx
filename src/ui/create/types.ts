import type { MediaTarget, JobMode } from '../../queue/types.ts';
import type { ReferenceAsset, ImportPreview, ImportedJobDraft } from '../../import/types.ts';

export interface UnsupportedSetting {
  readonly id: string;
  readonly label: string;
  readonly disabled: true;
  readonly reason: string;
}

export interface UnsupportedSettingsMap {
  readonly customNegativePrompt: UnsupportedSetting;
  readonly videoAspectRatioOverride: UnsupportedSetting;
  readonly customSeed: UnsupportedSetting;
  readonly highResUpscale: UnsupportedSetting;
}

export interface JevSimulatedRubricResult {
  readonly isMock: true;
  readonly score: number;
  readonly noul: boolean;
  readonly choice: string;
  readonly rubric: string;
}

export interface CreatePanelState {
  readonly media: MediaTarget;
  readonly mode: JobMode;
  readonly promptsText: string;
  readonly references: readonly ReferenceAsset[];
  readonly currentRefIndex: number;
  readonly sampleRefs: readonly ReferenceAsset[];
  readonly selectedTheme: string;
  readonly selectedLighting: string;
  readonly isPromptHelperOpen: boolean;
  readonly jevStatus: 'idle' | 'evaluating' | 'completed' | 'error';
  readonly jevResult: JevSimulatedRubricResult | null;
  readonly jevNotice: string;
  readonly unsupportedSettings: UnsupportedSettingsMap;
  readonly validationErrors: readonly string[];
  readonly statusMessage: string | null;
  readonly statusType: 'info' | 'success' | 'warning' | 'error' | null;
}

export interface EnqueueCommand {
  readonly type: 'ENQUEUE_JOBS';
  readonly media: MediaTarget;
  readonly mode: JobMode;
  readonly jobs: readonly ImportedJobDraft[];
  readonly preview: ImportPreview;
}

export interface TemplatePromptInput {
  readonly styleTheme: string;
  readonly lighting: string;
}

export type EnqueueCommandHandler = (command: EnqueueCommand) => Promise<boolean | void>;
