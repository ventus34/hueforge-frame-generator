/**
 * Enumerate safe split boundaries for a straight frame rail.
 *
 * Kept free of geometry imports so parameter validation and mesh generation can
 * share the same seam policy without a runtime import cycle.
 */
export interface SplitSeamPlanInput {
  length: number;
  maxPartLength: number;
  maxNominalSpan: number;
  keepouts: number[];
  seamClearance: number;
  cornerClearance: number;
}

export interface SplitSeamPlanResult {
  /** One entry per attempted segment count; null means no safe boundary plan. */
  plans: Array<number[] | null>;
  /** Matches the geometry planner's targeted corner + hanger failure condition. */
  hangerAndCornerBlocked: boolean;
}

export function planSafeSplitBoundaries(input: SplitSeamPlanInput): SplitSeamPlanResult {
  const { length, maxPartLength, maxNominalSpan, keepouts, seamClearance, cornerClearance } = input;
  const minimumSegmentSpan = Math.min(10, Math.max(2, maxNominalSpan / 4));
  const plans: Array<number[] | null> = [];
  let hangerAndCornerBlocked = false;

  let count = length <= maxPartLength
    ? 1
    : Math.max(2, Math.ceil(length / maxNominalSpan));

  for (; count <= Math.min(1000, Math.ceil(length / minimumSegmentSpan) + 1); count++) {
    let boundaries: number[] | null = [0];
    const desiredSpan = length / count;

    for (let index = 1; index < count; index++) {
      const previous = boundaries[boundaries.length - 1];
      const remaining = count - index;
      const lower = Math.max(
        previous + minimumSegmentSpan,
        length - remaining * maxNominalSpan,
        index === 1 ? cornerClearance : 0
      );
      const upper = Math.min(
        length - remaining * minimumSegmentSpan,
        previous + maxNominalSpan,
        index === count - 1 ? length - cornerClearance : length
      );
      if (lower > upper + 1e-8) {
        boundaries = null;
        break;
      }

      const target = index * desiredSpan;
      const candidates = new Set<number>([lower, upper, Math.max(lower, Math.min(upper, target))]);
      for (const center of keepouts) {
        candidates.add(center - seamClearance - 0.1);
        candidates.add(center + seamClearance + 0.1);
      }
      for (let candidate = lower; candidate <= upper; candidate += 0.5) candidates.add(candidate);

      const safeCandidates = [...candidates].filter(candidate => (
        candidate >= lower - 1e-8
        && candidate <= upper + 1e-8
        && keepouts.every(center => Math.abs(candidate - center) >= seamClearance - 1e-8)
      ));
      if (safeCandidates.length === 0) {
        if (lower <= upper + 1e-8 && cornerClearance > 0 && keepouts.length > 0) {
          hangerAndCornerBlocked = true;
        }
        boundaries = null;
        break;
      }
      safeCandidates.sort((a, b) => Math.abs(a - target) - Math.abs(b - target));
      boundaries.push(safeCandidates[0]);
    }

    if (boundaries) {
      boundaries.push(length);
      const fits = boundaries.slice(1).every((end, index) => (
        end - boundaries![index] <= maxNominalSpan + 1e-6
      ));
      plans.push(fits ? boundaries : null);
    } else {
      plans.push(null);
    }
  }

  return { plans, hangerAndCornerBlocked };
}
