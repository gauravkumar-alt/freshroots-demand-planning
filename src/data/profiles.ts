// Scenario profiles behind the demo data. Each SKU is generated to land in a specific, known scenario
// so the demo shows every rule and every judgement case. The engine never reads these profiles;
// it only sees the generated SAP / Zoho rows.

import type { Perishability } from "@/business/types";

export type Scenario =
  | "NORMAL"
  | "HIGH_DEMAND"
  | "STOCKOUT"
  | "STOCKOUT_HIGH_DEMAND"
  | "STOCKOUT_PO_COVERED"
  | "OVERSTOCK"
  | "OVERSTOCK_FALLING"
  | "CONFLICT"
  | "DISTRIBUTOR_SHIFT"
  | "PERISHABLE_WITHIN"
  | "PERISHABLE_ABOVE"
  | "PERISHABLE_BELOW"
  | "NEW_LAUNCH"
  | "ZERO_SALES";

export interface SkuProfile {
  sku: string;
  product: string;
  category: string;
  perishability: Perishability;
  soq: number;
  scenario: Scenario;
  /** Target 12-week average units/week */
  avg12: number;
  /** Target change of 4-week vs 12-week average */
  change: number;
  /** Target weeks of stock against festival-adjusted demand (ignored when `stock` is set) */
  wos: number;
  stock?: number;
  /** Weeks of history, for new launches */
  history?: number;
  /** Number of distributors carrying the SKU */
  reach: number;
  /** Index (into DISTRIBUTORS) of the distributor whose share jumps, for DISTRIBUTOR_SHIFT */
  shiftTo?: number;
}

export const DISTRIBUTORS = [
  "Shree Ganesh Traders, Pune",
  "Sai Krupa Distributors, Nashik",
  "Konkan Coast Agencies, Ratnagiri",
  "Panjim Retail Supply, Panaji",
  "Margao FMCG Depot, Margao",
  "Vidarbha Consumer Goods, Nagpur",
  "Marathwada Sales Corp, Sambhajinagar",
  "Thane Metro Distributors, Thane",
  "Navi Mumbai Wholesale, Vashi",
  "Andheri Trade Links, Mumbai",
  "Kolhapur Agro Mart, Kolhapur",
  "Satara Supply House, Satara",
  "Solapur Retail Network, Solapur",
  "Nagar Trading Co., Ahmednagar",
  "Sangli Distributors, Sangli",
  "Jalgaon Mercantile, Jalgaon",
  "Amravati Wholesale, Amravati",
  "Latur Consumer Supply, Latur",
  "Mapusa Market Agency, Mapusa",
  "Vasco Port Traders, Vasco da Gama",
  "Kalyan Dombivli Distributors, Kalyan",
  "Pimpri Chinchwad Agencies, Pimpri",
  "Nanded Traders, Nanded",
  "Dadar Wholesale Mart, Mumbai",
];

const p = (
  sku: string,
  product: string,
  category: string,
  perishability: Perishability,
  soq: number,
  scenario: Scenario,
  avg12: number,
  change: number,
  wos: number,
  reach: number,
  extra: Partial<SkuProfile> = {},
): SkuProfile => ({ sku, product, category, perishability, soq, scenario, avg12, change, wos, reach, ...extra });

export const PROFILES: SkuProfile[] = [
  // Stockout + high demand (multiple rules)
  p("FR-1001", "Masala Chips 100g", "Snacks", "Medium", 1000, "STOCKOUT_HIGH_DEMAND", 980, 0.2755, 0, 12, { stock: 4200 }),
  p("FR-1014", "Bhujia Sev 200g", "Namkeen", "Low", 2400, "STOCKOUT_HIGH_DEMAND", 1460, 0.31, 3.9, 14),
  p("FR-1032", "Alphonso Mango Drink 600ml", "Beverages", "Medium", 3000, "STOCKOUT_HIGH_DEMAND", 2120, 0.26, 4.6, 16),
  // Stockout
  p("FR-1003", "Tomato Twist Chips 52g", "Snacks", "Medium", 4000, "STOCKOUT", 2650, 0.06, 4.8, 15),
  p("FR-1017", "Farali Chivda 400g", "Namkeen", "Low", 1200, "STOCKOUT", 620, 0.12, 3.1, 10),
  p("FR-1022", "Elaichi Rusk 300g", "Bakery", "Medium", 1500, "STOCKOUT", 880, -0.04, 5.2, 11),
  p("FR-1041", "Kanda Lasun Masala 200g", "Spices & Masala", "Low", 1000, "STOCKOUT", 540, 0.09, 2.6, 13),
  // Stockout, but an open Zoho PO lands within the fortnight
  p("FR-1036", "Lemon Soda 250ml", "Beverages", "Low", 2500, "STOCKOUT_PO_COVERED", 1340, 0.05, 4.4, 12),
  // High demand only
  p("FR-1005", "Peri Peri Nachos 60g", "Snacks", "Medium", 2000, "HIGH_DEMAND", 760, 0.34, 9.2, 10),
  p("FR-1012", "Moong Dal Namkeen 150g", "Namkeen", "Low", 2000, "HIGH_DEMAND", 1180, 0.23, 7.4, 13),
  p("FR-1027", "Butter Cookies 200g", "Biscuits", "Low", 3000, "HIGH_DEMAND", 1690, 0.28, 8.6, 14),
  p("FR-1053", "Kaju Katli Gift Box 250g", "Sweets", "Medium", 800, "HIGH_DEMAND", 410, 0.47, 10.8, 9),
  // Unusual distributor behaviour (judgement)
  p("FR-1019", "Kokum Sharbat 750ml", "Beverages", "Low", 1200, "DISTRIBUTOR_SHIFT", 520, 0.33, 8.1, 8, { shiftTo: 3 }),
  p("FR-1029", "Cashew Cookies 150g", "Biscuits", "Low", 1800, "DISTRIBUTOR_SHIFT", 930, 0.29, 9.4, 9, { shiftTo: 4 }),
  p("FR-1045", "Goda Masala 100g", "Spices & Masala", "Low", 1000, "DISTRIBUTOR_SHIFT", 470, 0.02, 10.2, 10, { shiftTo: 2 }),
  p("FR-1057", "Puran Poli Ready Mix 500g", "Ready to Eat", "Medium", 600, "DISTRIBUTOR_SHIFT", 300, 0.26, 7.8, 7, { shiftTo: 18 }),
  // Overstock
  p("FR-1008", "Salted Banana Chips 150g", "Snacks", "Medium", 1500, "OVERSTOCK", 690, -0.03, 17.6, 9),
  p("FR-1024", "Glucose Biscuits 100g", "Biscuits", "Low", 6000, "OVERSTOCK", 3420, 0.01, 15.4, 20),
  p("FR-1039", "Jeera Soda 250ml", "Beverages", "Low", 2000, "OVERSTOCK", 860, -0.08, 21.3, 11),
  p("FR-1048", "Sambar Masala 100g", "Spices & Masala", "Low", 1200, "OVERSTOCK", 380, 0.04, 16.2, 12),
  p("FR-1009", "Cheese Balls 40g", "Snacks", "Medium", 2500, "OVERSTOCK_FALLING", 1240, -0.21, 19.8, 12),
  p("FR-1062", "Instant Poha 80g Cup", "Ready to Eat", "Low", 1500, "OVERSTOCK_FALLING", 520, -0.29, 24.5, 9),
  // High demand + overstock conflict (judgement)
  p("FR-1031", "Rose Falooda Mix 200g", "Beverages", "Low", 1000, "CONFLICT", 440, 0.24, 18.4, 8),
  p("FR-1051", "Besan Ladoo 400g", "Sweets", "Medium", 800, "CONFLICT", 350, 0.38, 15.7, 8),
  // High perishability (3–4 week window)
  p("FR-1071", "Fresh Paneer 200g", "Dairy", "High", 3000, "PERISHABLE_WITHIN", 2280, 0.04, 3.4, 14),
  p("FR-1072", "Malai Dahi 400g", "Dairy", "High", 2500, "PERISHABLE_ABOVE", 1530, -0.02, 5.0, 13),
  p("FR-1073", "Kesar Shrikhand 250g", "Dairy", "High", 1000, "PERISHABLE_ABOVE", 610, 0.08, 6.1, 10),
  p("FR-1076", "Ladi Pav 6pc", "Bakery", "High", 4000, "PERISHABLE_BELOW", 2940, 0.07, 2.3, 12),
  p("FR-1077", "Garlic Bread Loaf", "Bakery", "High", 1200, "PERISHABLE_WITHIN", 720, -0.05, 3.7, 9),
  p("FR-1074", "Fresh Mint Chutney 200g", "Ready to Eat", "High", 800, "PERISHABLE_WITHIN", 430, 0.1, 3.2, 8),
  // Insufficient data (judgement)
  p("FR-1081", "Millet Chakli 150g", "Namkeen", "Medium", 1000, "NEW_LAUNCH", 520, 0, 6, 6, { history: 5 }),
  p("FR-1082", "Ragi Thins 100g", "Snacks", "Medium", 1500, "NEW_LAUNCH", 640, 0, 7, 7, { history: 8 }),
  p("FR-1083", "Cold Coffee Can 200ml", "Beverages", "Medium", 2000, "NEW_LAUNCH", 950, 0, 4, 9, { history: 3 }),
  p("FR-1066", "Sabudana Vada Mix 400g", "Ready to Eat", "Low", 800, "ZERO_SALES", 180, 0, 0, 5, { stock: 2350 }),
  // Normal: within range, no action
  p("FR-1002", "Classic Salted Chips 100g", "Snacks", "Medium", 4000, "NORMAL", 2980, 0.05, 8.3, 20),
  p("FR-1004", "Masala Peanuts 200g", "Snacks", "Low", 2000, "NORMAL", 1130, -0.06, 10.4, 14),
  p("FR-1006", "Corn Puffs 50g", "Snacks", "Medium", 3000, "NORMAL", 1870, 0.08, 7.1, 15),
  p("FR-1011", "Aloo Bhujia 400g", "Namkeen", "Low", 2400, "NORMAL", 1520, 0.03, 9.6, 17),
  p("FR-1013", "Khatta Meetha 200g", "Namkeen", "Low", 1800, "NORMAL", 980, -0.09, 11.8, 13),
  p("FR-1015", "Navratan Mix 400g", "Namkeen", "Low", 1500, "NORMAL", 760, 0.11, 8.8, 12),
  p("FR-1016", "Chakli 200g", "Namkeen", "Medium", 1200, "NORMAL", 690, 0.07, 7.6, 11),
  p("FR-1021", "Milk Rusk 300g", "Bakery", "Medium", 2500, "NORMAL", 1350, 0.02, 9.1, 14),
  p("FR-1023", "Nankhatai 200g", "Bakery", "Medium", 1000, "NORMAL", 470, 0.1, 6.9, 9),
  p("FR-1025", "Marie Biscuits 250g", "Biscuits", "Low", 5000, "NORMAL", 2760, -0.04, 12.2, 19),
  p("FR-1026", "Cream Biscuits Choco 75g", "Biscuits", "Low", 4000, "NORMAL", 2240, 0.09, 8.4, 18),
  p("FR-1028", "Jeera Cookies 200g", "Biscuits", "Low", 1500, "NORMAL", 720, -0.02, 10.9, 11),
  p("FR-1033", "Kokum Agal 500ml", "Beverages", "Low", 800, "NORMAL", 330, 0.06, 9.8, 8),
  p("FR-1034", "Masala Chaas 200ml", "Beverages", "Medium", 3000, "NORMAL", 1980, -0.07, 6.6, 15),
  p("FR-1035", "Aam Panna 750ml", "Beverages", "Low", 1000, "NORMAL", 410, -0.12, 12.9, 9),
  p("FR-1037", "Jaljeera Mix 100g", "Beverages", "Low", 1000, "NORMAL", 290, 0.04, 13.1, 10),
  p("FR-1042", "Malvani Masala 200g", "Spices & Masala", "Low", 800, "NORMAL", 360, 0.08, 11.4, 9),
  p("FR-1043", "Kolhapuri Misal Masala 100g", "Spices & Masala", "Low", 1200, "NORMAL", 640, 0.12, 8.2, 12),
  p("FR-1044", "Turmeric Powder 500g", "Spices & Masala", "Low", 2000, "NORMAL", 1210, 0.01, 10.6, 16),
  p("FR-1046", "Red Chilli Powder 500g", "Spices & Masala", "Low", 2000, "NORMAL", 1090, -0.05, 9.3, 16),
  p("FR-1052", "Modak Pack 200g", "Sweets", "Medium", 600, "NORMAL", 280, 0.14, 6.8, 7),
  p("FR-1054", "Chikki Peanut 100g", "Sweets", "Low", 1500, "NORMAL", 830, 0.05, 9.9, 13),
  p("FR-1056", "Shev Bhaji Kit 300g", "Ready to Eat", "Medium", 800, "NORMAL", 340, -0.03, 8.7, 8),
  p("FR-1058", "Pohe Mix 200g", "Ready to Eat", "Low", 1200, "NORMAL", 560, 0.06, 10.1, 11),
  p("FR-1061", "Poha 1kg", "Staples", "Low", 3000, "NORMAL", 1780, 0.02, 11.3, 18),
  p("FR-1063", "Besan 1kg", "Staples", "Low", 2500, "NORMAL", 1420, -0.04, 9.7, 17),
];
