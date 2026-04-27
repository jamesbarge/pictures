/**
 * Post-Deploy Verification — Trigger.dev wrapper.
 *
 * @deprecated Thin shim around `runPostDeployVerify` in @/lib/jobs/post-deploy-verify.
 * This file will be deleted when src/trigger/ is removed in the
 * local-scraping-rebuild migration.
 */

import { task } from "@trigger.dev/sdk/v3";
import { runPostDeployVerify, type DeployPayload } from "@/lib/jobs/post-deploy-verify";

export const postDeployVerify = task({
  id: "post-deploy-verify",
  maxDuration: 120,
  retry: { maxAttempts: 1 },
  run: (payload: DeployPayload) => runPostDeployVerify(payload),
});
