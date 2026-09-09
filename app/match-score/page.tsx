import { redirect } from "next/navigation";

/**
 * "Am I ready?" was a job-description form wrapped around a score that ignored
 * the job description: it parsed the posting, kept the title, and rendered the
 * learner's target-role readiness — the same number for any posting pasted.
 * The readiness figure was real, so it moved to /gap-analyzer where it is shown
 * without pretending a posting produced it. This redirect keeps old links alive.
 */
export default function MatchScorePage() {
  redirect("/gap-analyzer");
}
