import { onBeforeUnmount, onMounted, ref, watch, type Ref } from "vue";

/**
 * Continuous vertical auto-scroll via requestAnimationFrame, with a seamless
 * loop and pause-on-reflow support.
 *
 * HOW THE LOOP WORKS:
 * The content (the grid) is duplicated — copy 1 then copy 2 — by the caller
 * (PhotoGrid renders [...items, ...items]). We translate the content upward
 * by `offset`. When `offset` reaches `contentHeight / 2` (one full copy), we
 * snap `offset` back to 0. Since copy 2 is visually identical to copy 1, the
 * snap is invisible — the viewer sees an endless scroll.
 *
 * PAUSE/RESUME:
 * When a new photo arrives, the caller calls `pause(ms)` so the FLIP reflow
 * animation doesn't compound with the scroll motion. After `ms`, scroll
 * resumes automatically.
 *
 * LOW-COUNT:
 * If the content fits within the viewport (not enough to scroll), we don't
 * scroll — the caller should center it instead.
 */
export function useAutoScroll(opts: {
  /** Ref to the scroll container (overflow-hidden element). */
  containerRef: Ref<HTMLElement | null>;
  /** Ref to the inner content (the thing being translateY'd). */
  contentRef: Ref<HTMLElement | null>;
  /** Scroll speed in px/sec. ~30 = roughly one row every 3-4s. */
  speed: Ref<number>;
  /** Whether there's enough content to scroll (caller decides via item count). */
  enabled: Ref<boolean>;
}) {
  const { containerRef, contentRef, speed, enabled } = opts;

  const offset = ref(0);
  const isPaused = ref(false);
  const isScrolling = ref(false);

  let rafId: number | null = null;
  let lastFrame = 0;
  let pauseTimer: ReturnType<typeof setTimeout> | null = null;
  let halfHeight = 0;

  function measure() {
    const content = contentRef.value;
    const container = containerRef.value;
    if (!content || !container) return;

    // scrollHeight includes the duplicated copy; half = one full set.
    halfHeight = content.scrollHeight / 2;

    // Enable scrolling only if content is taller than the container.
    const shouldScroll = enabled.value && content.scrollHeight > container.clientHeight + 10;
    isScrolling.value = shouldScroll;
  }

  function frame(now: number) {
    rafId = requestAnimationFrame(frame);

    if (!lastFrame) lastFrame = now;
    const delta = now - lastFrame;
    lastFrame = now;

    if (isPaused.value || !isScrolling.value) return;

    // speed is px/sec; convert to px for this frame's delta time.
    offset.value += (speed.value * delta) / 1000;

    // Seamless loop: snap back to 0 after one full copy.
    if (halfHeight > 0 && offset.value >= halfHeight) {
      offset.value -= halfHeight;
    }
  }

  function applyTransform() {
    const content = contentRef.value;
    if (content) {
      content.style.transform = `translateY(${-offset.value}px)`;
    }
  }

  // Re-measure on resize and when enabled/items change.
  let resizeObserver: ResizeObserver | null = null;

  function start() {
    if (rafId !== null) return;
    lastFrame = 0;
    rafId = requestAnimationFrame(frame);
  }

  function stop() {
    if (rafId !== null) {
      cancelAnimationFrame(rafId);
      rafId = null;
    }
  }

  /** Pause scrolling for `ms` milliseconds, then auto-resume. */
  function pause(ms = 500) {
    isPaused.value = true;
    if (pauseTimer) clearTimeout(pauseTimer);
    pauseTimer = setTimeout(() => {
      isPaused.value = false;
      pauseTimer = null;
    }, ms);
  }

  /**
   * Reset scroll to the top (offset 0) and pause. Used when a new photo
   * arrives — the grid is rebuilt with the new photo at position 0 (the
   * hero slot), so resetting to top ensures it's visible. The pause gives
   * the FLIP animation time to play before scrolling resumes.
   */
  function resetToTop(ms = 1500) {
    offset.value = 0;
    pause(ms);
  }

  function resume() {
    isPaused.value = false;
    if (pauseTimer) {
      clearTimeout(pauseTimer);
      pauseTimer = null;
    }
  }

  onMounted(() => {
    // Initial measure + start the rAF loop.
    measure();
    start();

    // Re-measure after images load (lazy images expand the content height
    // after mount). A few staggered checks cover most load timing windows.
    const reMeasureTimers = [200, 500, 1000, 2000].map((ms) =>
      setTimeout(measure, ms),
    );

    // Observe content size changes (new photos, layout reflow, image load).
    const content = contentRef.value;
    const container = containerRef.value;
    if (typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => measure());
      if (content) resizeObserver.observe(content);
      if (container) resizeObserver.observe(container);
    }

    // Apply transform whenever offset changes.
    watch(offset, applyTransform);

    // Clean up staggered timers on unmount.
    onBeforeUnmount(() => {
      reMeasureTimers.forEach(clearTimeout);
    });
  });

  // Re-measure when speed or enabled changes.
  watch([speed, enabled], measure);

  onBeforeUnmount(() => {
    stop();
    if (pauseTimer) clearTimeout(pauseTimer);
    resizeObserver?.disconnect();
    resizeObserver = null;
  });

  return { offset, isPaused, isScrolling, pause, resume, measure, resetToTop };
}
