import {
  PromptError,
  type PromptDraft,
  type PromptEditInput,
  type PromptComponents
} from './types.ts';
import {
  getStyle,
  getScene,
  getLighting,
  getMotion
} from './templates.ts';
import { formatPromptText } from './generator.ts';

export function editPrompt(
  draft: PromptDraft,
  edits: PromptEditInput
): PromptDraft {
  if (edits.theme !== undefined && edits.theme.trim().length === 0) {
    throw new PromptError(
      'EMPTY_THEME',
      'Edited prompt theme cannot be empty or whitespace only.'
    );
  }

  const updatedTheme = edits.theme !== undefined ? edits.theme.trim() : draft.components.theme;
  const updatedStyle = edits.styleId !== undefined ? getStyle(edits.styleId) : draft.components.style;
  const updatedScene = edits.sceneId !== undefined ? getScene(edits.sceneId) : draft.components.scene;
  const updatedLighting = edits.lightingId !== undefined ? getLighting(edits.lightingId) : draft.components.lighting;

  const updatedMotion =
    draft.mediaTarget === 'video'
      ? edits.motionId !== undefined
        ? getMotion(edits.motionId)
        : draft.components.motion
      : undefined;

  const stylePhrase = updatedStyle.phrase;
  const scenePhrase = updatedScene.phrase;
  const lightingPhrase = updatedLighting.phrase;
  const motionPhrase = updatedMotion ? updatedMotion.phrase : undefined;

  const customPrefix = edits.customPrefix !== undefined ? edits.customPrefix : draft.customPrefix;
  const customSuffix = edits.customSuffix !== undefined ? edits.customSuffix : draft.customSuffix;

  const formattedPrompt = formatPromptText({
    theme: updatedTheme,
    stylePhrase,
    scenePhrase,
    lightingPhrase,
    motionPhrase,
    customPrefix,
    customSuffix
  });

  const updatedComponents: PromptComponents = {
    theme: updatedTheme,
    style: updatedStyle,
    scene: updatedScene,
    lighting: updatedLighting,
    motion: updatedMotion
  };

  return {
    ...draft,
    formattedPrompt,
    components: updatedComponents,
    customPrefix,
    customSuffix,
    updatedAt: Date.now()
  };
}

export function appendClause(draft: PromptDraft, clause: string): PromptDraft {
  const trimmed = clause.trim();
  if (trimmed.length === 0) {
    return draft;
  }

  const newSuffix = draft.customSuffix
    ? `${draft.customSuffix}, ${trimmed}`
    : trimmed;

  return editPrompt(draft, { customSuffix: newSuffix });
}

export function toPromptTextList(drafts: readonly PromptDraft[]): string {
  return drafts.map((d) => d.formattedPrompt).join('\n');
}
