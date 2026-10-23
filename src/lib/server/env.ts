import "server-only";

/** Server-side configuration. Each integration falls back to a labelled simulation when its keys are missing. */
export const env = {
  supabaseUrl: () => process.env.SUPABASE_URL || "",
  supabaseServiceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  geminiKey: () => process.env.GEMINI_API_KEY || "",
  geminiModel: () => process.env.GEMINI_MODEL || "gemini-flash-latest",
  zohoClientId: () => process.env.ZOHO_CLIENT_ID || "",
  zohoClientSecret: () => process.env.ZOHO_CLIENT_SECRET || "",
  zohoRefreshToken: () => process.env.ZOHO_REFRESH_TOKEN || "",
  zohoDc: () => process.env.ZOHO_DC || "in",
  zohoOrgId: () => process.env.ZOHO_ORG_ID || "",
  zohoVendorId: () => process.env.ZOHO_VENDOR_ID || "",
  resendKey: () => process.env.RESEND_API_KEY || "",
  emailFrom: () => process.env.EMAIL_FROM || "Freshroots Planning <onboarding@resend.dev>",
  killSwitchEmail: () => process.env.KILL_SWITCH_EMAIL || "",
  appUrl: () =>
    process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3400"),
};

export function integrationStatus() {
  return {
    supabase: Boolean(env.supabaseUrl() && env.supabaseServiceKey()),
    gemini: Boolean(env.geminiKey()),
    zoho: hasZoho(),
    email: Boolean(env.resendKey() && env.killSwitchEmail()),
    emailTo: env.killSwitchEmail() || null,
  };
}

export function hasZoho() {
  return Boolean(env.zohoClientId() && env.zohoClientSecret() && env.zohoRefreshToken() && env.zohoOrgId() && env.zohoVendorId());
}

let cachedToken: { value: string; expires: number } | null = null;

/** Zoho access tokens last an hour; swap the long-lived refresh token for a fresh one when needed. */
export async function zohoAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expires > Date.now() + 60_000) return cachedToken.value;
  const p = new URLSearchParams({
    refresh_token: env.zohoRefreshToken(),
    client_id: env.zohoClientId(),
    client_secret: env.zohoClientSecret(),
    grant_type: "refresh_token",
  });
  const res = await fetch(`https://accounts.zoho.${env.zohoDc()}/oauth/v2/token?${p}`, { method: "POST", cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number; error?: string };
  if (!body.access_token) throw new Error(`Zoho sign-in failed${body.error ? `: ${body.error}` : ""}. Check the refresh token has ZohoInventory scopes.`);
  cachedToken = { value: body.access_token, expires: Date.now() + (body.expires_in ?? 3600) * 1000 };
  return body.access_token;
}
