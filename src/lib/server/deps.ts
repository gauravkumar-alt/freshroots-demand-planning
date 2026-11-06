import "server-only";
import { createPurchaseOrder } from "@/business/purchaseOrder";
import { sendKillSwitchEmail } from "./email";
import type { WorkflowDeps } from "./workflow";

export const liveDeps: WorkflowDeps = { createPurchaseOrder, sendKillSwitchEmail };
