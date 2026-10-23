import type { CsvRecord } from "./csv";
import { addDays, standardiseDate, toDate, weekEnding } from "./dates";
import { RULES } from "./rulesConfig";
import type {
  Perishability,
  PreparedDataset,
  PreparedSku,
  PurchaseOrderRow,
  RawDatasets,
  SalesRow,
  InventoryRow,
  SkuMasterRow,
} from "./types";

export type FileKind = "sales" | "inventory" | "skuMaster" | "purchaseOrders" | "distributors" | "calendar";
export type CoreFileKind = "sales" | "inventory" | "skuMaster" | "purchaseOrders";
export const FILE_KINDS: FileKind[] = ["sales", "inventory", "skuMaster", "purchaseOrders", "distributors", "calendar"];

export const FILE_SPECS: Record<FileKind, { label: string; system: "SAP" | "Zoho Inventory" | "Master data"; columns: { key: string; label: string; aliases: string[]; required: boolean }[] }> = {
  sales: {
    label: "Sales",
    system: "SAP",
    columns: [
      { key: "sku", label: "SKU", aliases: ["sku", "skuid", "skucode", "material", "materialcode"], required: true },
      { key: "product", label: "Product", aliases: ["product", "productname", "skuname", "materialdescription", "description"], required: false },
      { key: "distributor", label: "Distributor", aliases: ["distributor", "distributorname", "distributorid", "customer", "customername"], required: false },
      { key: "week", label: "Week", aliases: ["week", "weekending", "weekendingdate", "weekenddate", "date"], required: true },
      { key: "units", label: "Units sold", aliases: ["unitssold", "units", "qty", "quantity", "salesqty"], required: true },
    ],
  },
  inventory: {
    label: "Inventory",
    system: "SAP",
    columns: [
      { key: "sku", label: "SKU", aliases: ["sku", "skuid", "skucode", "material", "materialcode"], required: true },
      { key: "currentStock", label: "Current stock", aliases: ["currentstock", "stock", "onhand", "unitsonhand", "stockonhand", "unrestrictedstock"], required: true },
      { key: "location", label: "Location", aliases: ["location", "warehouse", "plant", "storagelocation"], required: false },
      { key: "asOfDate", label: "As-of date", aliases: ["asofdate", "asof", "snapshotdate", "date"], required: false },
    ],
  },
  skuMaster: {
    label: "SKU master",
    system: "SAP",
    columns: [
      { key: "sku", label: "SKU", aliases: ["sku", "skuid", "skucode", "material", "materialcode"], required: true },
      { key: "product", label: "Product", aliases: ["product", "productname", "skuname", "materialdescription", "description"], required: true },
      { key: "category", label: "Category", aliases: ["category", "productcategory"], required: true },
      { key: "perishability", label: "Perishability", aliases: ["perishability", "perishable", "shelflifeclass"], required: true },
      { key: "standardOrderQty", label: "Standard order quantity", aliases: ["standardorderquantity", "standardorderqty", "standardreorderqty", "standardreorderquantity", "soq", "moq"], required: true },
      { key: "distributorId", label: "Distributor", aliases: ["distributorid", "distributor", "distributorcode"], required: false },
    ],
  },
  purchaseOrders: {
    label: "Purchase orders",
    system: "Zoho Inventory",
    columns: [
      { key: "sku", label: "SKU", aliases: ["sku", "skuid", "skucode", "item", "itemsku"], required: true },
      { key: "distributor", label: "Distributor", aliases: ["distributor", "distributorname", "vendor", "customer"], required: true },
      { key: "previousOrder", label: "Previous order", aliases: ["previousorder", "previousorderqty", "lastorder", "lastorderqty"], required: true },
      { key: "orderQty", label: "Order quantity", aliases: ["orderquantity", "orderqty", "quantity", "qty"], required: true },
      { key: "orderDate", label: "Order date", aliases: ["orderdate", "podate", "date"], required: true },
      { key: "expectedDelivery", label: "Expected delivery date", aliases: ["expecteddeliverydate", "expecteddelivery", "deliverydate", "eta"], required: false },
    ],
  },
  distributors: {
    label: "Distributor master",
    system: "Master data",
    columns: [
      { key: "id", label: "Distributor ID", aliases: ["distributorid", "id", "code", "distributorcode"], required: true },
      { key: "name", label: "Distributor name", aliases: ["distributorname", "name"], required: true },
      { key: "region", label: "Region", aliases: ["region", "state"], required: false },
      { key: "status", label: "Status", aliases: ["status", "active"], required: false },
    ],
  },
  calendar: {
    label: "Festival calendar",
    system: "Master data",
    columns: [
      { key: "yearMonth", label: "Year-month", aliases: ["yearmonth", "month", "period"], required: false },
      { key: "year", label: "Year", aliases: ["year"], required: false },
      { key: "month", label: "Month", aliases: ["month", "monthnumber"], required: false },
      { key: "festival", label: "Is festival month", aliases: ["isfestivalmonth", "festival", "isfestival", "festivalmonth"], required: true },
    ],
  },
};

const OPTIONAL_FILES: FileKind[] = ["purchaseOrders", "distributors", "calendar"];

export type Severity = "error" | "warning" | "info";

export interface ValidationIssue {
  severity: Severity;
  file: FileKind | "combined";
  code: string;
  message: string;
  row?: number;
  sku?: string;
}

export interface FileReport {
  kind: FileKind;
  provided: boolean;
  rowsRead: number;
  rowsAccepted: number;
  missingColumns: string[];
}

export interface ValidationReport {
  files: FileReport[];
  issues: ValidationIssue[];
  /** False when a required file or column is missing, so no analysis can run. */
  canRun: boolean;
  dataset: PreparedDataset | null;
  clean: RawDatasets;
  summary: { skus: number; distributors: number; weeks: number; salesRows: number; insufficientHistory: string[]; firstWeek: string | null; lastWeek: string | null };
}

const norm = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

export function standardiseSku(value: string): string {
  const v = value.trim().toUpperCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  const m = v.match(/^FR-?0*(\d{1,4})$/);
  return m ? `FR-${m[1].padStart(4, "0")}` : v;
}

function parseNumber(v: string | undefined): number | null {
  if (v === undefined) return null;
  const s = v.replace(/,/g, "").trim();
  if (s === "" || !/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Number(s);
}

function parsePerishability(v: string): Perishability | null {
  const s = v.trim().toLowerCase();
  if (["high", "h"].includes(s)) return "High";
  if (["medium", "med", "m"].includes(s)) return "Medium";
  if (["low", "l"].includes(s)) return "Low";
  return null;
}

/** Maps uploaded headers to our field keys. Returns the mapping and the required columns that are absent. */
function mapColumns(kind: FileKind, headers: string[]) {
  const byNorm = new Map(headers.map((h) => [norm(h), h]));
  const mapping: Record<string, string> = {};
  const missing: string[] = [];
  for (const col of FILE_SPECS[kind].columns) {
    const hit = col.aliases.map((a) => byNorm.get(a)).find(Boolean);
    if (hit) mapping[col.key] = hit;
    else if (col.required) missing.push(col.label);
  }
  return { mapping, missing };
}

export interface RawFile {
  headers: string[];
  rows: CsvRecord[];
}

/**
 * Validates the four exports and combines them into one clean weekly dataset.
 * Rows that fail validation are dropped and reported; nothing is silently corrected without an issue entry.
 */
export function validateAndPrepare(files: Partial<Record<FileKind, RawFile>>): ValidationReport {
  const issues: ValidationIssue[] = [];
  const reports: FileReport[] = [];
  const clean: RawDatasets = { sales: [], inventory: [], skuMaster: [], purchaseOrders: [] };
  let skuFixes = 0;
  let dateFixes = 0;

  const each = (kind: FileKind, fn: (get: (key: string) => string, rowNo: number) => boolean) => {
    const file = files[kind];
    if (!file) {
      reports.push({ kind, provided: false, rowsRead: 0, rowsAccepted: 0, missingColumns: [] });
      const optional = OPTIONAL_FILES.includes(kind);
      const optionalMessage: Partial<Record<FileKind, string>> = {
        purchaseOrders: "No Zoho purchase-order file. Recommendations will run without open-order context.",
        distributors: "No distributor master. Distributors are shown by the name or ID in the other files.",
        calendar: "No festival calendar. Using the documented festival months: October, November and March.",
      };
      issues.push({
        severity: optional ? (kind === "purchaseOrders" ? "warning" : "info") : "error",
        file: kind,
        code: optional ? "OPTIONAL_FILE_MISSING" : "FILE_MISSING",
        message: optional ? optionalMessage[kind]! : `${FILE_SPECS[kind].label} file (${FILE_SPECS[kind].system}) is required.`,
      });
      return;
    }
    const { mapping, missing } = mapColumns(kind, file.headers);
    if (missing.length) {
      issues.push({ severity: "error", file: kind, code: "COLUMNS_MISSING", message: `Missing required column${missing.length > 1 ? "s" : ""}: ${missing.join(", ")}.` });
      reports.push({ kind, provided: true, rowsRead: file.rows.length, rowsAccepted: 0, missingColumns: missing });
      return;
    }
    let accepted = 0;
    file.rows.forEach((row, i) => {
      const get = (key: string) => (mapping[key] ? (row[mapping[key]] ?? "").trim() : "");
      if (fn(get, i + 2)) accepted++;
    });
    reports.push({ kind, provided: true, rowsRead: file.rows.length, rowsAccepted: accepted, missingColumns: [] });
    if (file.rows.length === 0) issues.push({ severity: "error", file: kind, code: "EMPTY", message: "File has a header but no rows." });
  };

  const sku = (raw: string) => {
    const s = standardiseSku(raw);
    if (s !== raw) skuFixes++;
    return s;
  };
  const date = (raw: string) => {
    const d = standardiseDate(raw);
    if (d && d !== raw) dateFixes++;
    return d;
  };
  const missingValue = (file: FileKind, row: number, field: string) =>
    issues.push({ severity: "error", file, row, code: "MISSING_VALUE", message: `Row ${row}: ${field} is empty. Row skipped.` });
  const badNumber = (file: FileKind, row: number, field: string, value: string) =>
    issues.push({ severity: "error", file, row, code: "INVALID_NUMBER", message: `Row ${row}: ${field} "${value}" is not a valid non-negative number. Row skipped.` });

  // Distributor master: ID → name, used to name distributors in sales and the SKU master.
  const distributorNames = new Map<string, string>();
  each("distributors", (get, row) => {
    if (!get("id") || !get("name")) return missingValue("distributors", row, !get("id") ? "distributor ID" : "distributor name"), false;
    const id = get("id").trim().toUpperCase();
    if (distributorNames.has(id)) {
      issues.push({ severity: "warning", file: "distributors", row, code: "DUPLICATE", message: `Row ${row}: duplicate distributor ${id}. First entry kept.` });
      return false;
    }
    if (get("status") && !/^(active|yes|true|y|1)$/i.test(get("status"))) {
      issues.push({ severity: "info", file: "distributors", row, code: "INACTIVE", message: `Row ${row}: ${get("name")} is marked ${get("status")}.` });
    }
    distributorNames.set(id, get("name"));
    return true;
  });
  const distributorName = (raw: string) => distributorNames.get(raw.trim().toUpperCase()) ?? raw.trim();

  // Festival calendar: "YYYY-MM" → festival flag.
  let festivalCalendar: Record<string, boolean> | null = null;
  each("calendar", (get, row) => {
    let key = get("yearMonth");
    if (!/^\d{4}-\d{1,2}$/.test(key) && get("year") && get("month")) key = `${get("year")}-${get("month")}`;
    const m = key.match(/^(\d{4})-(\d{1,2})$/);
    const flag = get("festival").toLowerCase();
    if (!m || +m[2] < 1 || +m[2] > 12) {
      issues.push({ severity: "error", file: "calendar", row, code: "INVALID_DATE", message: `Row ${row}: month "${key || "(empty)"}" is not a valid year-month. Row skipped.` });
      return false;
    }
    if (!["true", "false", "yes", "no", "y", "n", "1", "0"].includes(flag)) {
      issues.push({ severity: "error", file: "calendar", row, code: "INVALID_VALUE", message: `Row ${row}: festival flag "${get("festival")}" must be TRUE or FALSE. Row skipped.` });
      return false;
    }
    (festivalCalendar ??= {})[`${m[1]}-${m[2].padStart(2, "0")}`] = ["true", "yes", "y", "1"].includes(flag);
    return true;
  });

  // SKU master next: it defines which SKUs are known.
  const masterSeen = new Set<string>();
  const masterBySku = new Map<string, SkuMasterRow>();
  each("skuMaster", (get, row) => {
    for (const f of ["sku", "product", "category", "perishability", "standardOrderQty"]) if (!get(f)) return missingValue("skuMaster", row, f), false;
    const id = sku(get("sku"));
    const per = parsePerishability(get("perishability"));
    if (!per) {
      issues.push({ severity: "error", file: "skuMaster", row, sku: id, code: "INVALID_VALUE", message: `Row ${row}: perishability "${get("perishability")}" must be High, Medium or Low. Row skipped.` });
      return false;
    }
    const soq = parseNumber(get("standardOrderQty"));
    if (soq === null || soq <= 0) return badNumber("skuMaster", row, "standard order quantity", get("standardOrderQty")), false;
    if (masterSeen.has(id)) {
      issues.push({ severity: "warning", file: "skuMaster", row, sku: id, code: "DUPLICATE", message: `Row ${row}: duplicate SKU ${id}. First entry kept.` });
      return false;
    }
    masterSeen.add(id);
    const row_: SkuMasterRow = { sku: id, product: get("product"), category: get("category"), perishability: per, standardOrderQty: soq, distributorId: get("distributorId") || null };
    masterBySku.set(id, row_);
    clean.skuMaster.push(row_);
    return true;
  });

  const unknown = { sales: new Set<string>(), inventory: new Set<string>(), purchaseOrders: new Set<string>() };

  const salesSeen = new Set<string>();
  let weekShifted = 0;
  let salesWithoutDistributor = 0;
  each("sales", (get, row) => {
    for (const f of ["sku", "week", "units"]) if (!get(f)) return missingValue("sales", row, f), false;
    const id = sku(get("sku"));
    const d = date(get("week"));
    if (!d) {
      issues.push({ severity: "error", file: "sales", row, sku: id, code: "INVALID_DATE", message: `Row ${row}: week "${get("week")}" is not a recognised date. Row skipped.` });
      return false;
    }
    const week = weekEnding(d);
    if (week !== d) weekShifted++;
    const u = parseNumber(get("units"));
    if (u === null || u < 0) return badNumber("sales", row, "units sold", get("units")), false;
    if (!masterSeen.has(id)) return unknown.sales.add(id), false;
    // Sales files without a distributor column take the distributor from the SKU master.
    const rawDist = get("distributor") || masterBySku.get(id)?.distributorId || "";
    if (!get("distributor")) salesWithoutDistributor++;
    const distributor = rawDist ? distributorName(rawDist) : "Unassigned";
    const key = `${id}|${distributor}|${week}`;
    if (salesSeen.has(key)) {
      issues.push({ severity: "warning", file: "sales", row, sku: id, code: "DUPLICATE", message: `Row ${row}: duplicate record for ${id} / ${distributor} / week ending ${week}. First entry kept.` });
      return false;
    }
    salesSeen.add(key);
    clean.sales.push({ sku: id, product: get("product"), distributor, week, units: u });
    return true;
  });

  // Stock is summed across locations; the same SKU twice at one location is a duplicate.
  const invSeen = new Set<string>();
  const stockBySku = new Map<string, number>();
  const locations = new Set<string>();
  let asOfDate: string | null = null;
  each("inventory", (get, row) => {
    for (const f of ["sku", "currentStock"]) if (!get(f)) return missingValue("inventory", row, f), false;
    const id = sku(get("sku"));
    const s = parseNumber(get("currentStock"));
    if (s === null || s < 0) return badNumber("inventory", row, "current stock", get("currentStock")), false;
    if (!masterSeen.has(id)) return unknown.inventory.add(id), false;
    const loc = get("location");
    const key = `${id}|${loc}`;
    if (invSeen.has(key)) {
      issues.push({ severity: "warning", file: "inventory", row, sku: id, code: "DUPLICATE", message: `Row ${row}: duplicate stock record for ${id}${loc ? ` at ${loc}` : ""}. First entry kept.` });
      return false;
    }
    invSeen.add(key);
    if (loc) locations.add(loc);
    if (get("asOfDate")) {
      const d = date(get("asOfDate"));
      if (d && (!asOfDate || d > asOfDate)) asOfDate = d;
    }
    stockBySku.set(id, (stockBySku.get(id) ?? 0) + s);
    return true;
  });
  for (const [id, currentStock] of stockBySku) clean.inventory.push({ sku: id, currentStock });
  if (locations.size > 1) issues.push({ severity: "info", file: "inventory", code: "LOCATIONS_SUMMED", message: `Stock summed across ${locations.size} locations.` });

  const poSeen = new Set<string>();
  each("purchaseOrders", (get, row) => {
    for (const f of ["sku", "distributor", "previousOrder", "orderQty", "orderDate"]) if (!get(f)) return missingValue("purchaseOrders", row, f), false;
    const id = sku(get("sku"));
    const prev = parseNumber(get("previousOrder"));
    const qty = parseNumber(get("orderQty"));
    if (prev === null || prev < 0) return badNumber("purchaseOrders", row, "previous order", get("previousOrder")), false;
    if (qty === null || qty < 0) return badNumber("purchaseOrders", row, "order quantity", get("orderQty")), false;
    const od = date(get("orderDate"));
    if (!od) {
      issues.push({ severity: "error", file: "purchaseOrders", row, sku: id, code: "INVALID_DATE", message: `Row ${row}: order date "${get("orderDate")}" is not a recognised date. Row skipped.` });
      return false;
    }
    let ed: string | null = null;
    if (get("expectedDelivery")) {
      ed = date(get("expectedDelivery"));
      if (!ed) issues.push({ severity: "warning", file: "purchaseOrders", row, sku: id, code: "INVALID_DATE", message: `Row ${row}: expected delivery "${get("expectedDelivery")}" not recognised. Treated as unknown.` });
    }
    if (!masterSeen.has(id)) return unknown.purchaseOrders.add(id), false;
    const key = `${id}|${get("distributor")}|${od}|${qty}`;
    if (poSeen.has(key)) {
      issues.push({ severity: "warning", file: "purchaseOrders", row, sku: id, code: "DUPLICATE", message: `Row ${row}: duplicate purchase order for ${id} / ${get("distributor")} on ${od}. First entry kept.` });
      return false;
    }
    poSeen.add(key);
    clean.purchaseOrders.push({ sku: id, distributor: get("distributor"), previousOrder: prev, orderQty: qty, orderDate: od, expectedDelivery: ed });
    return true;
  });

  for (const kind of ["sales", "inventory", "purchaseOrders"] as const) {
    const list = [...unknown[kind]];
    if (list.length) {
      issues.push({
        severity: "warning",
        file: kind,
        code: "UNKNOWN_SKU",
        message: `${list.length} SKU${list.length > 1 ? "s" : ""} not in the SKU master (or their master row was rejected), rows excluded: ${list.slice(0, 8).join(", ")}${list.length > 8 ? "…" : ""}.`,
      });
    }
  }
  if (skuFixes) issues.push({ severity: "info", file: "combined", code: "SKU_STANDARDISED", message: `${skuFixes} SKU codes standardised to the FR-0000 format (case, spaces, leading zeros).` });
  if (dateFixes) issues.push({ severity: "info", file: "combined", code: "DATE_STANDARDISED", message: `${dateFixes} dates converted to YYYY-MM-DD.` });
  if (salesWithoutDistributor) {
    issues.push({ severity: "info", file: "sales", code: "DISTRIBUTOR_FROM_MASTER", message: `${salesWithoutDistributor.toLocaleString("en-IN")} sales rows have no distributor column; distributor taken from the SKU master.` });
  }
  if (festivalCalendar) {
    const fest = Object.entries(festivalCalendar as Record<string, boolean>).filter(([, v]) => v).map(([k]) => k);
    issues.push({ severity: "info", file: "calendar", code: "CALENDAR_LOADED", message: `Festival months from the calendar: ${fest.join(", ") || "none"}.` });
  }
  if (weekShifted) issues.push({ severity: "info", file: "sales", code: "WEEK_ALIGNED", message: `${weekShifted} sales dates aligned to their week-ending Sunday.` });

  const fatal = issues.some((i) => i.severity === "error" && (i.code === "FILE_MISSING" || i.code === "COLUMNS_MISSING"));
  const canRun = !fatal && clean.sales.length > 0 && clean.skuMaster.length > 0;
  const dataset = canRun ? prepareDataset(clean, { asOfDate, festivalCalendar }) : null;

  const insufficientHistory: string[] = [];
  if (dataset) {
    for (const s of dataset.skus) {
      const first = s.weekly.findIndex((v) => v !== null);
      const history = first === -1 ? 0 : s.weekly.length - first;
      if (history < RULES.minHistoryWeeks) insufficientHistory.push(s.master.sku);
      if (s.currentStock === null) {
        issues.push({ severity: "warning", file: "inventory", sku: s.master.sku, code: "NO_STOCK_RECORD", message: `${s.master.sku} ${s.master.product} has no inventory record. It will go to manual review.` });
      }
    }
    if (insufficientHistory.length) {
      issues.push({
        severity: "warning",
        file: "sales",
        code: "SHORT_HISTORY",
        message: `${insufficientHistory.length} SKU${insufficientHistory.length > 1 ? "s have" : " has"} under ${RULES.minHistoryWeeks} weeks of history and will be sent to manual review: ${insufficientHistory.join(", ")}.`,
      });
    }
    if (dataset.weeks.length < RULES.minHistoryWeeks) {
      issues.push({ severity: "warning", file: "sales", code: "SHORT_FILE", message: `The sales file covers only ${dataset.weeks.length} weeks. Every SKU will need manual review.` });
    }
  }

  return {
    files: FILE_KINDS.map((k) => reports.find((r) => r.kind === k)!),
    issues,
    canRun,
    dataset,
    clean,
    summary: {
      skus: dataset?.skus.length ?? 0,
      distributors: dataset?.distributors.length ?? 0,
      weeks: dataset?.weeks.length ?? 0,
      salesRows: clean.sales.length,
      insufficientHistory,
      firstWeek: dataset?.weeks[0] ?? null,
      lastWeek: dataset?.analysisWeek ?? null,
    },
  };
}

/** Combines clean sales, inventory, SKU master and purchase orders into one weekly analysis dataset. */
export function prepareDataset(
  clean: RawDatasets,
  extras: { asOfDate?: string | null; festivalCalendar?: Record<string, boolean> | null } = {},
): PreparedDataset {
  const allWeeks = [...new Set(clean.sales.map((s) => s.week))].sort();
  const first = allWeeks[0];
  const last = allWeeks[allWeeks.length - 1];
  const weeks: string[] = [];
  for (let w = first; toDate(w) <= toDate(last); w = addDays(w, 7)) weeks.push(w);
  const weekIdx = new Map(weeks.map((w, i) => [w, i]));

  const salesBySku = groupBy(clean.sales, (s) => s.sku);
  const stockBySku = new Map(clean.inventory.map((i) => [i.sku, i.currentStock]));
  const poBySku = groupBy(clean.purchaseOrders, (p) => p.sku);
  const distributors = new Set<string>();

  const skus: PreparedSku[] = clean.skuMaster.map((master) => {
    const rows: SalesRow[] = salesBySku.get(master.sku) ?? [];
    const byDistributor: Record<string, number[]> = {};
    const totals = new Array<number>(weeks.length).fill(0);
    let firstIdx = weeks.length;
    for (const r of rows) {
      const i = weekIdx.get(r.week)!;
      distributors.add(r.distributor);
      (byDistributor[r.distributor] ??= new Array<number>(weeks.length).fill(0))[i] += r.units;
      totals[i] += r.units;
      firstIdx = Math.min(firstIdx, i);
    }
    const weekly = totals.map((v, i) => (i < firstIdx ? null : v));
    return {
      master,
      weekly,
      byDistributor,
      currentStock: stockBySku.has(master.sku) ? stockBySku.get(master.sku)! : null,
      purchaseOrders: (poBySku.get(master.sku) ?? []) as PurchaseOrderRow[],
    };
  });

  return {
    analysisWeek: last,
    asOfDate: extras.asOfDate ?? null,
    festivalCalendar: extras.festivalCalendar ?? null,
    weeks,
    skus,
    distributors: [...distributors].sort(),
  };
}

function groupBy<T>(items: T[], key: (t: T) => string): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const it of items) {
    const k = key(it);
    const list = m.get(k);
    if (list) list.push(it);
    else m.set(k, [it]);
  }
  return m;
}

/** Converts typed rows back into raw CSV-shaped files, used to feed demo data through the same validation path as uploads. */
export function datasetsToRawFiles(d: RawDatasets): Record<CoreFileKind, RawFile> {
  const toFile = <T extends object>(rows: T[], cols: [string, keyof T][]): RawFile => ({
    headers: cols.map((c) => c[0]),
    rows: rows.map((r) => Object.fromEntries(cols.map(([h, k]) => [h, r[k] === null || r[k] === undefined ? "" : String(r[k])]))),
  });
  return {
    sales: toFile<SalesRow>(d.sales, [["SKU", "sku"], ["Product", "product"], ["Distributor", "distributor"], ["Week", "week"], ["Units sold", "units"]]),
    inventory: toFile<InventoryRow>(d.inventory, [["SKU", "sku"], ["Current stock", "currentStock"]]),
    skuMaster: toFile<SkuMasterRow>(d.skuMaster, [["SKU", "sku"], ["Product", "product"], ["Category", "category"], ["Perishability", "perishability"], ["Standard order quantity", "standardOrderQty"]]),
    purchaseOrders: toFile<PurchaseOrderRow>(d.purchaseOrders, [
      ["SKU", "sku"],
      ["Distributor", "distributor"],
      ["Previous order", "previousOrder"],
      ["Order quantity", "orderQty"],
      ["Order date", "orderDate"],
      ["Expected delivery date", "expectedDelivery"],
    ]),
  };
}
