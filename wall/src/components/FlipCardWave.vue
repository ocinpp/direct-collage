<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from "vue";
import type { AspectRatio, CompositePublicDTO } from "@direct-collage/shared";

const props = defineProps<{
  composites: CompositePublicDTO[];
  ratio: AspectRatio;
  scrollSpeed: number;
}>();

/**
 * CARD FLIP WAVE — a grid of square photo cards that flip in a left-to-right
 * wave every ~8s, revealing new photos on the back face.
 *
 * The grid dimensions are COMPUTED from the container's actual pixel size so
 * that square cards tile with minimal blank space on any screen aspect ratio.
 * A ResizeObserver re-computes on viewport changes.
 */

/** Derive wave interval from speed: 0 = 16s (slow), 100 = 3s (fast). Default ~30 → 8s. */
const waveMs = computed(() => {
  const s = props.scrollSpeed;
  return Math.round(16000 - (s / 100) * 13000);
});
const FLIP_STAGGER_MS = 120;
const GAP_PX = 12;
const MIN_CARD_PX = 80; // don't make cards smaller than this

// --- Dynamic grid sizing ---
const containerRef = ref<HTMLElement | null>(null);
const numCols = ref(5);
const numRows = ref(3);

/** Recompute grid dimensions from the container size to minimize blank space. */
function recomputeGrid() {
  const el = containerRef.value;
  if (!el) return;
  const w = el.clientWidth;
  const h = el.clientHeight;
  if (w === 0 || h === 0) return;

  // How many square cards fit? Card size = (width - gaps) / cols.
  // We want: cardW ≈ cardH, and cols × cardW ≈ w, rows × cardH ≈ h.
  // Try column counts from 3 to 10, pick the one with least vertical waste.
  let best = { cols: 5, rows: 3, waste: Infinity };
  for (let cols = 3; cols <= 10; cols++) {
    const cardW = (w - GAP_PX * (cols - 1)) / cols;
    if (cardW < MIN_CARD_PX) break;
    const rows = Math.max(1, Math.round((h + GAP_PX) / (cardW + GAP_PX)));
    const totalCardH = rows * cardW + GAP_PX * (rows - 1);
    const verticalWaste = Math.abs(totalCardH - h) / h;
    const horizontalWaste = 0; // cols fill width exactly
    const waste = verticalWaste + horizontalWaste;
    if (waste < best.waste) {
      best = { cols, rows, waste };
    }
  }

  numCols.value = best.cols;
  numRows.value = best.rows;
}

const numCards = computed(() => numCols.value * numRows.value);

let resizeObserver: ResizeObserver | null = null;

// --- Card state ---
interface CardState {
  faceA: CompositePublicDTO | null;
  faceB: CompositePublicDTO | null;
  flipped: boolean;
}

const cards = ref<CardState[]>([]);

function rebuildCards() {
  const count = numCards.value;
  const oldCards = cards.value;
  cards.value = Array.from({ length: count }, (_, i) => oldCards[i] ?? {
    faceA: null,
    faceB: null,
    flipped: false,
  });
  // Trim if grid shrank
  if (cards.value.length > count) cards.value = cards.value.slice(0, count);
  // Fill any null faces
  for (const card of cards.value) {
    if (!card.faceA) card.faceA = nextPhoto();
    if (!card.faceB) card.faceB = nextPhoto();
  }
}

/**
 * SHUFFLED ROTATION with spread + dedup.
 *
 * The rotation is a Fisher-Yates shuffled copy of the composites, with a
 * "spread pass" that separates adjacent photos sharing the same template
 * variant (a proxy for "might look similar"). A cursor walks linearly so
 * each photo appears exactly once per full cycle. nextPhoto() skips any
 * photo currently visible on a card face (dedup).
 *
 * New photos (SSE) are inserted a few positions ahead of the cursor so they
 * appear in the next 1-2 waves — graceful, not immediate.
 */

let rotation: CompositePublicDTO[] = [];
let nextPhotoIdx = 0;

/** Fisher-Yates shuffle (in-place). */
function shuffle(arr: CompositePublicDTO[]): CompositePublicDTO[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * Spread pass: walk the array and if two adjacent items share the same
 * templateVariant, swap the second one forward by a few positions. Reduces
 * visual clustering of similar-looking composites.
 */
function spread(arr: CompositePublicDTO[]): CompositePublicDTO[] {
  const a = [...arr];
  for (let i = 1; i < a.length - 1; i++) {
    if (a[i]!.templateVariant === a[i - 1]!.templateVariant) {
      // Find the next item with a different variant, swap it in.
      for (let j = i + 1; j < a.length; j++) {
        if (a[j]!.templateVariant !== a[i - 1]!.templateVariant) {
          [a[i], a[j]] = [a[j]!, a[i]!];
          break;
        }
      }
    }
  }
  return a;
}

/**
 * Get the next photo from the rotation that is NOT currently visible on any
 * card face. Prevents duplicates — the same photo won't appear on two cards
 * simultaneously, even when the cursor wraps.
 */
function nextPhoto(): CompositePublicDTO | null {
  if (rotation.length === 0) return null;

  const visibleIds = new Set<string>();
  for (const card of cards.value) {
    if (card.faceA) visibleIds.add(card.faceA.id);
    if (card.faceB) visibleIds.add(card.faceB.id);
  }

  for (let step = 0; step < rotation.length; step++) {
    const idx = (nextPhotoIdx + step) % rotation.length;
    const photo = rotation[idx];
    if (photo && !visibleIds.has(photo.id)) {
      nextPhotoIdx = idx + 1;
      return photo;
    }
  }

  // Fallback (all visible — shouldn't happen with dedup + enough photos).
  const photo = rotation[nextPhotoIdx % rotation.length];
  nextPhotoIdx++;
  return photo ?? null;
}

/** Initialize: shuffle + spread the composites, then fill cards. */
function initCards() {
  rotation = spread(shuffle(props.composites));
  nextPhotoIdx = 0;
  cards.value = Array.from({ length: numCards.value }, () => ({
    faceA: null,
    faceB: null,
    flipped: false,
  }));
  for (const card of cards.value) {
    card.faceA = nextPhoto();
    card.faceB = nextPhoto();
  }
}

function triggerWave() {
  for (const card of cards.value) {
    const newPhoto = nextPhoto();
    if (!newPhoto) continue;
    if (!card.flipped) {
      card.faceB = newPhoto;
    } else {
      card.faceA = newPhoto;
    }
  }
  for (const card of cards.value) card.flipped = !card.flipped;
}

let cycleTimer: ReturnType<typeof setInterval> | null = null;

function restartCycle() {
  if (cycleTimer) clearInterval(cycleTimer);
  cycleTimer = setInterval(triggerWave, waveMs.value);
}

// Restart cycle when speed changes.
watch(waveMs, restartCycle);

onMounted(() => {
  recomputeGrid();
  if (props.composites.length > 0) initCards();
  restartCycle();

  if (typeof ResizeObserver !== "undefined" && containerRef.value) {
    resizeObserver = new ResizeObserver(() => {
      recomputeGrid();
      rebuildCards();
    });
    resizeObserver.observe(containerRef.value);
  }
});

onUnmounted(() => {
  if (cycleTimer) clearInterval(cycleTimer);
  resizeObserver?.disconnect();
});

/**
 * New photo arrives via SSE. Insert it a few positions ahead of the current
 * cursor so it appears in the next 1-2 waves — not immediately (which would
 * interrupt the current display) and not after a full cycle (too long).
 */
watch(
  () => props.composites[0]?.id,
  (newId, oldId) => {
    if (!newId || newId === oldId) return;
    const newPhoto = props.composites.find((c) => c.id === newId);
    if (!newPhoto) return;
    // Remove if already in rotation (safety dedup).
    rotation = rotation.filter((c) => c.id !== newId);
    // Insert ~numCards positions ahead of the cursor — it'll be picked in
    // the next wave or two as the cursor advances.
    const insertPos = (nextPhotoIdx + numCards.value) % Math.max(rotation.length + 1, 1);
    rotation = [...rotation.slice(0, insertPos), newPhoto, ...rotation.slice(insertPos)];
  },
);

watch(
  () => props.composites,
  (newComposites) => {
    rotation = [...newComposites];
    const idSet = new Set(newComposites.map((c) => c.id));
    const stale = cards.value.some(
      (c) =>
        (c.faceA && !idSet.has(c.faceA.id)) ||
        (c.faceB && !idSet.has(c.faceB.id)),
    );
    if (stale || cards.value.every((c) => !c.faceA)) {
      initCards();
    }
  },
  { deep: false },
);

// Rebuild cards when grid dimensions change
watch(numCards, () => rebuildCards());

function flipDelay(index: number): string {
  const col = index % numCols.value;
  return `${col * FLIP_STAGGER_MS}ms`;
}

const cellAspect = computed(() => {
  switch (props.ratio) {
    case "1:1":
      return "1 / 1";
    case "4:5":
      return "4 / 5";
    case "9:16":
      return "9 / 16";
  }
});
</script>

<template>
  <div ref="containerRef" class="h-full overflow-hidden p-3">
    <div
      class="grid h-full w-full gap-3"
      :style="{
        gridTemplateColumns: `repeat(${numCols}, 1fr)`,
        gridTemplateRows: `repeat(${numRows}, 1fr)`,
      }"
    >
      <div
        v-for="(card, i) in cards"
        :key="i"
        class="flip-card"
        :style="{ aspectRatio: cellAspect }"
      >
        <div
          class="flip-card-inner"
          :class="{ flipped: card.flipped }"
          :style="{ transitionDelay: flipDelay(i) }"
        >
          <div class="flip-card-face flip-card-front">
            <img
              v-if="card.faceA"
              :src="card.faceA.url"
              :alt="`Photo ${i}`"
              class="h-full w-full object-cover"
            />
          </div>
          <div class="flip-card-face flip-card-back">
            <img
              v-if="card.faceB"
              :src="card.faceB.url"
              :alt="`Photo ${i} back`"
              class="h-full w-full object-cover"
            />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flip-card {
  perspective: 1000px;
}

.flip-card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s cubic-bezier(0.4, 0, 0.2, 1);
  transform-style: preserve-3d;
}

.flip-card-inner.flipped {
  transform: rotateY(180deg);
}

.flip-card-face {
  position: absolute;
  inset: 0;
  overflow: hidden;
  border-radius: 0.5rem;
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  background: #111;
  box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.3);
}

.flip-card-back {
  transform: rotateY(180deg);
}
</style>
