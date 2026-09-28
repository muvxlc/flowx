import type { RuntimeBridge } from '../integration/service-bridge.ts';
import type { CreateController } from '../ui/create/create-controller.ts';
import type { MediaTarget, JobMode, Job } from '../queue/types.ts';
import { createJob } from '../queue/state.ts';
import { renderCreateView } from '../ui/create/create-view.ts';

export interface CreateGlueCallbacks {
  onBatchEnqueued: (newJobs: Job[]) => void;
  onRefresh: () => void;
}

export function renderAndBindCreateTab(
  container: HTMLElement,
  controller: CreateController,
  bridge: RuntimeBridge,
  callbacks: CreateGlueCallbacks
): void {
  const state = controller.getState();
  container.innerHTML = renderCreateView(state);

  container.querySelector('#btnEnqueuePrompts')?.addEventListener('click', async () => {
    const textarea = container.querySelector<HTMLTextAreaElement>('#txtPrompts');
    if (textarea && typeof textarea.value === 'string' && textarea.value.trim().length > 0) {
      controller.setPromptsText(textarea.value);
    }

    const preview = controller.getPreview();
    if (!preview.isValid) {
      callbacks.onRefresh();
      const errBox = container.querySelector<HTMLElement>('#createValidationError');
      errBox?.focus();
      return;
    }

    const currentState = controller.getState();
    const batch = {
      media: currentState.media,
      mode: currentState.mode,
      promptsText: currentState.promptsText,
      references: currentState.references,
    };

    try {
      const resp = (await bridge.sendCommand('QUEUE_COMMAND', {
        command: 'ENQUEUE',
        batch,
      })) as { success?: boolean; jobs?: Job[]; error?: string; mockMode?: boolean };

      if (resp?.success && resp.jobs) {
        controller.setPromptsText('');
        callbacks.onBatchEnqueued(resp.jobs);
        return;
      }

      if (resp?.success === false && bridge.hasRuntime()) {
        const errMsg = resp.error || 'Extension worker rejected enqueue command';
        (controller as unknown as { validationErrors: string[]; statusMessage: string; statusType: string }).validationErrors = [errMsg];
        (controller as unknown as { validationErrors: string[]; statusMessage: string; statusType: string }).statusMessage = errMsg;
        (controller as unknown as { validationErrors: string[]; statusMessage: string; statusType: string }).statusType = 'error';
        callbacks.onRefresh();
        const errBox = container.querySelector<HTMLElement>('#createValidationError');
        errBox?.focus();
        return;
      }
    } catch (err: unknown) {
      if (bridge.hasRuntime()) {
        const errMsg = err instanceof Error ? err.message : 'Failed to communicate with extension worker';
        (controller as unknown as { validationErrors: string[]; statusMessage: string; statusType: string }).validationErrors = [errMsg];
        (controller as unknown as { validationErrors: string[]; statusMessage: string; statusType: string }).statusMessage = errMsg;
        (controller as unknown as { validationErrors: string[]; statusMessage: string; statusType: string }).statusType = 'error';
        callbacks.onRefresh();
        const errBox = container.querySelector<HTMLElement>('#createValidationError');
        errBox?.focus();
        return;
      }
    }

    let enqueuedJobs: Job[] = [];
    controller.onEnqueue(async (cmd) => {
      enqueuedJobs = cmd.jobs.map((d) => createJob({ ...d, state: 'pending' }));
    });

    const submitRes = await controller.submitEnqueue();
    if (submitRes.success && enqueuedJobs.length > 0) {
      controller.setPromptsText('');
      callbacks.onBatchEnqueued(enqueuedJobs);
    } else {
      callbacks.onRefresh();
      const errBox = container.querySelector<HTMLElement>('#createValidationError');
      errBox?.focus();
    }
  });

  container.querySelector('#btnRunWalkthrough')?.addEventListener('click', () => {
    controller.setPromptsText(
      'A futuristic neo-Tokyo skyline at twilight, 35mm photograph\nA serene bamboo forest temple in Kyoto with warm lantern light'
    );
    callbacks.onRefresh();
  });

  container.querySelector('#btnCycleMockRef')?.addEventListener('click', () => {
    if (controller.getState().references.length === 0) {
      controller.setReferences(controller.getState().sampleRefs);
    }
    controller.cycleReference();
    callbacks.onRefresh();
    const btn = container.querySelector<HTMLButtonElement>('#btnCycleMockRef');
    btn?.focus();
  });

  container.querySelector('#btnLoadSamplePrompts')?.addEventListener('click', () => {
    controller.loadSamplePrompts();
    callbacks.onRefresh();
  });

  container.querySelector('#btnOpenPromptHelper')?.addEventListener('click', () => {
    controller.togglePromptHelper();
    callbacks.onRefresh();
    const btn = container.querySelector<HTMLButtonElement>('#btnOpenPromptHelper');
    btn?.focus();
  });

  container.querySelector('#btnAppendTemplatePrompt')?.addEventListener('click', () => {
    const selTheme = container.querySelector<HTMLSelectElement>('#selStyleTheme');
    const selLighting = container.querySelector<HTMLSelectElement>('#selLighting');
    const styleTheme = selTheme?.value ?? 'cinematic';
    const lighting = selLighting?.value ?? 'golden_hour';
    controller.appendTemplatePrompt({ styleTheme, lighting });
    callbacks.onRefresh();
  });

  container.querySelector('#btnEvalJev')?.addEventListener('click', async () => {
    const textarea = container.querySelector<HTMLTextAreaElement>('#txtPrompts');
    if (textarea && typeof textarea.value === 'string' && textarea.value.trim().length > 0) {
      controller.setPromptsText(textarea.value);
    }
    try {
      await controller.runSimulatedJevCheck();
    } catch {
    }
    callbacks.onRefresh();
  });

  container.querySelector('#btnImportTxt')?.addEventListener('click', () => {
    let fileInput = container.querySelector<HTMLInputElement>('#fileImportTxt');
    if (!fileInput && typeof document !== 'undefined' && document.createElement) {
      fileInput = document.createElement('input') as HTMLInputElement;
      fileInput.type = 'file';
      fileInput.id = 'fileImportTxt';
      fileInput.setAttribute('type', 'file');
      fileInput.setAttribute('id', 'fileImportTxt');
      fileInput.setAttribute('accept', '.txt,text/plain');
      fileInput.style.display = 'none';
      fileInput.addEventListener('change', async () => {
        const file = fileInput?.files?.[0];
        if (file) {
          const text = typeof file.text === 'function' ? await file.text() : '';
          controller.importFromTxt(text);
          callbacks.onRefresh();
        }
      });
      container.appendChild(fileInput);
    }
    fileInput?.click();
  });

  container.querySelectorAll<HTMLButtonElement>('[data-media]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const media = btn.getAttribute('data-media') as MediaTarget;
      if (media) {
        controller.setMedia(media);
        callbacks.onRefresh();
      }
    });
  });

  container.querySelectorAll<HTMLButtonElement>('[data-mode]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const mode = btn.getAttribute('data-mode') as JobMode;
      if (mode) {
        controller.setMode(mode);
        callbacks.onRefresh();
      }
    });
  });

  const textarea = container.querySelector<HTMLTextAreaElement>('#txtPrompts');
  if (textarea) {
    textarea.addEventListener('input', () => {
      controller.setPromptsText(textarea.value);
    });
  }
}
