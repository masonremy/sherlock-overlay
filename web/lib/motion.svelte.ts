// Reduced motion: when on, animations become instant (or a quick fade).
// Set from the overlay's reducedMotion setting or ?motion=off.

export const motion = $state({ reduced: false });

/** A duration that collapses to 0 under reduced motion. */
export function ms(duration: number): number {
  return motion.reduced ? 0 : duration;
}
