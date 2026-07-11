import { defineStore } from "pinia";
import { computed, ref, shallowRef } from "vue";
import type { AspectRatio, TemplateDef, WallPublicDTO } from "@direct-collage/shared";
import { getEnabledTemplates } from "@direct-collage/shared";
import { OUTPUT_DIMS, type PreparedImage, maxSlotEdge, prepareImage } from "../lib/image.js";
import type { SlotTransform } from "../lib/baker.js";
import { api } from "../lib/api.js";

type Phase = "loading" | "pick" | "edit" | "submitting" | "done" | "error";

export const useSubmitStore = defineStore("submit", () => {
  // --- Wall context ---
  const wall = ref<WallPublicDTO | null>(null);
  const wallError = ref<string | null>(null);

  // --- Wizard state ---
  const phase = ref<Phase>("loading");
  const template = ref<TemplateDef | null>(null);
  /** One PreparedImage per slot index (shallowRef: heavy objects). */
  const sources = shallowRef<(PreparedImage | null)[]>([]);
  /** Per-slot crop transform. */
  const transforms = ref<SlotTransform[]>([]);
  /** Which slot the user is currently filling. */
  const activeSlot = ref(0);

  // --- Submit state ---
  const uploadPct = ref(0);
  const submitError = ref<string | null>(null);
  const isSubmitting = ref(false);
  /** Guards against double-submit (idempotency at the UI level, PRD §6.1.6). */
  let submitStarted = false;

  const ratio = computed<AspectRatio>(() => wall.value?.aspectRatio ?? "1:1");
  const enabledTemplates = getEnabledTemplates();

  // --- Actions ---

  async function loadWall(slug: string) {
    phase.value = "loading";
    wallError.value = null;
    try {
      wall.value = await api.getWall(slug);
      if (wall.value.status !== "ACTIVE") {
        wallError.value = "This wall is not accepting submissions right now.";
        phase.value = "error";
        return;
      }
      // Solo is the only enabled template for Phase 1; auto-select it.
      if (enabledTemplates.length === 1) {
        selectTemplate(enabledTemplates[0]!);
      } else {
        phase.value = "pick";
      }
    } catch (e) {
      wallError.value = e instanceof Error ? e.message : "Failed to load wall";
      phase.value = "error";
    }
  }

  function selectTemplate(t: TemplateDef) {
    template.value = t;
    sources.value = new Array(t.slots).fill(null);
    transforms.value = Array.from({ length: t.slots }, () => ({
      scale: 1,
      offsetX: 0,
      offsetY: 0,
    }));
    activeSlot.value = firstEmptySlot();
    phase.value = "edit";
  }

  function firstEmptySlot(): number {
    const arr = sources.value;
    for (let i = 0; i < arr.length; i++) if (!arr[i]) return i;
    return 0;
  }

  /**
   * Handle a user-picked file for a slot: EXIF-correct + downsample (PRD §6.1.2),
   * then store the result. Throws on decode failure — caller surfaces the error.
   */
  async function fillSlot(slotIndex: number, file: File) {
    if (!template.value) throw new Error("No template selected");
    const cap = maxSlotEdge(template.value.rect, ratio.value);
    const prepared = await prepareImage(file, cap);

    // Replace previous entry without revoking a reused slot's URL prematurely.
    const next = sources.value.slice();
    const prev = next[slotIndex];
    next[slotIndex] = prepared;
    sources.value = next;

    if (prev) URL.revokeObjectURL(prev.url);

    activeSlot.value = firstEmptySlot();
  }

  function setTransform(slotIndex: number, t: SlotTransform) {
    transforms.value[slotIndex] = t;
  }

  function removeSlot(slotIndex: number) {
    const next = sources.value.slice();
    const prev = next[slotIndex];
    next[slotIndex] = null;
    sources.value = next;
    if (prev) URL.revokeObjectURL(prev.url);
    activeSlot.value = slotIndex;
  }

  const allSlotsFilled = computed(() =>
    sources.value.length > 0 && sources.value.every((s) => s !== null),
  );

  /**
   * Bake + submit (PRD Phase 1 step 5). Single-flighted: once started, cannot
   * be triggered again in this store's lifetime (idempotency, §6.1.6).
   */
  async function submit(permissionGranted: boolean) {
    if (submitStarted || isSubmitting.value) return;
    if (!wall.value || !template.value || !allSlotsFilled.value) return;

    submitStarted = true;
    isSubmitting.value = true;
    submitError.value = null;
    uploadPct.value = 0;
    phase.value = "submitting";

    try {
      const { bakeComposite } = await import("../lib/baker.js");
      const blob = await bakeComposite({
        ratio: ratio.value,
        slots: template.value.rect,
        sources: sources.value as PreparedImage[],
        transforms: transforms.value,
      });

      await api.submitComposite({
        wallSlug: wall.value.slug,
        file: blob,
        templateVariant: template.value.variant,
        permissionGranted,
        onProgress: (pct) => (uploadPct.value = pct),
      });

      phase.value = "done";
    } catch (e) {
      submitError.value = e instanceof Error ? e.message : "Submission failed";
      phase.value = "edit";
      // Allow retry on transient failures, but keep the single-flight guard
      // only within one attempt — reset once we're back in edit.
      submitStarted = false;
    } finally {
      isSubmitting.value = false;
    }
  }

  /**
   * Reset the wizard back to the template-pick/edit phase for the SAME wall,
   * clearing all chosen photos, transforms, submit state, and the permission
   * flag. Does NOT re-fetch the wall (it hasn't changed). Used after a
   * successful submit so the user can make another collage.
   */
  function reset() {
    // Revoke any held object URLs to avoid leaks.
    for (const s of sources.value) if (s) URL.revokeObjectURL(s.url);

    // Reset submit state so the button is clickable again.
    submitStarted = false;
    isSubmitting.value = false;
    submitError.value = null;
    uploadPct.value = 0;

    if (template.value) {
      // Re-enter the edit phase with the same template, slots cleared.
      const t = template.value;
      sources.value = new Array(t.slots).fill(null);
      transforms.value = Array.from({ length: t.slots }, () => ({
        scale: 1,
        offsetX: 0,
        offsetY: 0,
      }));
      activeSlot.value = 0;
      phase.value = "edit";
    } else if (wall.value) {
      // No template chosen yet: reload from the wall.
      loadWall(wall.value.slug);
    }
  }

  return {
    // state
    wall,
    wallError,
    phase,
    template,
    sources,
    transforms,
    activeSlot,
    uploadPct,
    submitError,
    isSubmitting,
    enabledTemplates,
    // computed
    ratio,
    allSlotsFilled,
    // actions
    loadWall,
    selectTemplate,
    fillSlot,
    setTransform,
    removeSlot,
    submit,
    reset,
  };
});

// Re-export for components that need the dims lookup.
export { OUTPUT_DIMS };
