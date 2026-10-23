import "server-only";
import { sendKillSwitchEmail } from "./email";
import type { WorkflowDeps } from "./workflow";
import { createPurchaseOrder } from "./zoho";

export const liveDeps: WorkflowDeps = { createPurchaseOrder, sendKillSwitchEmail };
