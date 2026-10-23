import { NextResponse } from "next/server";
import type { PurchaseOrderRequest, PurchaseOrderResult } from "@/business/zohoPurchaseOrder";
import { env, hasZoho, zohoAccessToken } from "@/lib/server/env";

export const dynamic = "force-dynamic";

function simulated(po: PurchaseOrderRequest): PurchaseOrderResult {
  // Deterministic number per run + SKU, so retries never create a second PO.
  let h = 0;
  for (const c of po.reference) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return { ok: true, mode: "simulated", poNumber: `SIM-PO-${String(h % 100000).padStart(5, "0")}` };
}

/** Raises a purchase order in Zoho Inventory, or simulates one when Zoho credentials are not set. */
export async function POST(req: Request) {
  const po = (await req.json().catch(() => null)) as PurchaseOrderRequest | null;
  if (!po?.sku || !po.quantity || po.quantity <= 0) return NextResponse.json<PurchaseOrderResult>({ ok: false, mode: "simulated", error: "Invalid purchase order." }, { status: 400 });

  if (!hasZoho()) return NextResponse.json(simulated(po));

  const org = env.zohoOrgId(), vendor = env.zohoVendorId();
  const base = `https://www.zohoapis.${env.zohoDc()}/inventory/v1`;
  let token: string;
  try {
    token = await zohoAccessToken();
  } catch (e) {
    return NextResponse.json<PurchaseOrderResult>({ ok: false, mode: "live", error: (e as Error).message });
  }
  const headers = { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" };
  try {
    const itemRes = await fetch(`${base}/items?organization_id=${org}&sku=${encodeURIComponent(po.sku)}`, { headers, cache: "no-store" });
    const items = (await itemRes.json()) as { items?: { item_id: string }[]; message?: string };
    const itemId = items.items?.[0]?.item_id;
    if (!itemId) return NextResponse.json<PurchaseOrderResult>({ ok: false, mode: "live", error: `No Zoho item with SKU ${po.sku}.` });

    const res = await fetch(`${base}/purchaseorders?organization_id=${org}`, {
      method: "POST",
      headers,
      cache: "no-store",
      body: JSON.stringify({
        vendor_id: vendor,
        reference_number: po.reference,
        delivery_date: po.deliveryDate,
        notes: po.notes,
        line_items: [{ item_id: itemId, quantity: po.quantity }],
      }),
    });
    const body = (await res.json()) as { code?: number; message?: string; purchaseorder?: { purchaseorder_number?: string } };
    if (!res.ok || body.code !== 0) return NextResponse.json<PurchaseOrderResult>({ ok: false, mode: "live", error: body.message ?? `Zoho returned ${res.status}.` });
    return NextResponse.json<PurchaseOrderResult>({ ok: true, mode: "live", poNumber: body.purchaseorder?.purchaseorder_number });
  } catch {
    return NextResponse.json<PurchaseOrderResult>({ ok: false, mode: "live", error: "Zoho did not respond. The order stays approved; retry from Procurement." });
  }
}
