import { NextResponse } from "next/server";
import { getSession } from "../../../lib/session";
import { getPlaybook, getProposals } from "../../../lib/server/services/playbook-service";
import { feedbackRepo } from "../../../lib/server/repositories/feedback-repo";

export const runtime = "nodejs";

// The playbook (versioned rules), pending and decided proposals, and the
// feedback counts the reflector reads from.
export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json({
    playbook: getPlaybook(session.email),
    proposals: getProposals(session.email),
    feedback: { counts: feedbackRepo.counts(session.email), recent: feedbackRepo.recent(session.email, 30) },
  });
}
