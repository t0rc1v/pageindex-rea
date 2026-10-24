"use client";

/**
 * Pairing between a question's versions and the answers they got.
 *
 * Editing a question appends a version to the user turn and asks it again; the
 * reply lands on the assistant turn as another run that names the version it
 * answered. Regenerating appends another run for the same version. Keeping the
 * rule here (pure, no React) is what lets the UI show a branch control on both
 * sides of the exchange without either side guessing.
 */
export interface QuestionedRun {
  /** Which version of the question this answer replied to (default 0). */
  questionRun?: number;
}

/** The run indexes that replied to question version `questionRun`, in order. */
export function answerRunsFor<T extends QuestionedRun>(runs: T[], questionRun: number): number[] {
  const out: number[] = [];
  runs.forEach((run, index) => {
    if ((run.questionRun ?? 0) === questionRun) out.push(index);
  });
  return out;
}

/**
 * The run to show for question version `questionRun`: the newest answer to that
 * wording, or — for chats stored before versions existed — the closest answer
 * that came before it.
 */
export function answerRunIndex<T extends QuestionedRun>(runs: T[], questionRun: number): number {
  const matching = answerRunsFor(runs, questionRun);
  if (matching.length > 0) return matching[matching.length - 1]!;
  let closest = 0;
  for (const [index, run] of runs.entries()) {
    if ((run.questionRun ?? 0) <= questionRun) closest = index;
  }
  return closest;
}
