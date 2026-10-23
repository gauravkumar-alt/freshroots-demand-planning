"use client";

import { OctagonAlert } from "lucide-react";
import * as React from "react";
import { useStore } from "@/state/store";
import { Button } from "./ui/button";
import { Dialog, DialogClose, DialogContent } from "./ui/sheet";
import { Label, Textarea } from "./ui/form";

export function KillSwitchBanner() {
  const store = useStore();
  const ks = store.killSwitch;
  const [reason, setReason] = React.useState("");
  const [open, setOpen] = React.useState(false);
  if (!ks?.active) return null;
  const held = store.procurement.filter((p) => p.po.kind === "HELD").length;

  return (
    <div role="alert" className="border-b border-rejected/40 bg-rejected text-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 lg:px-6">
        <OctagonAlert className="size-5 shrink-0" />
        <p className="min-w-0 flex-1 text-[13px]">
          <span className="font-semibold">Kill switch fired.</span> {ks.rejected} of {ks.decided} decisions this week were rejected ({((ks.rate ?? 0) * 100).toFixed(1)}%, above 50%). Zoho PO creation is halted
          {held ? ` (${held} held)` : ""}. {ks.lastEmail ? ks.lastEmail.reason : "Sending email…"}
        </p>
        <Dialog open={open} onOpenChange={setOpen}>
          <Button size="sm" className="border-white/40 bg-transparent text-white hover:bg-white/10" onClick={() => setOpen(true)}>
            Resume PO creation
          </Button>
          <DialogContent title="Resume PO creation?" description="The kill switch fired because the rules and Raghav disagree on most recommendations. Record why it is safe to continue.">
            <div className="grid gap-1">
              <Label htmlFor="resume-reason">Reason</Label>
              <Textarea id="resume-reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Rejections were one data issue in the SAP export, now fixed." />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <DialogClose asChild>
                <Button variant="ghost">Cancel</Button>
              </DialogClose>
              <Button
                variant="primary"
                disabled={reason.trim().length < 5}
                onClick={async () => {
                  const r = await store.resumeKillSwitch(reason.trim());
                  if (!r.ok) return store.notify(r.error);
                  setOpen(false);
                  setReason("");
                  store.notify("PO creation resumed. Held orders can be raised from Procurement.");
                }}
              >
                Resume and log it
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
