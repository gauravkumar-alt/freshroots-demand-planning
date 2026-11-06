import "server-only";

/** Server-side configuration. Each integration falls back to a labelled simulation when its keys are missing. */
export const env = {
  supabaseUrl: () => process.env.SUPABASE_URL || "",
  supabaseServiceKey: () => process.env.SUPABASE_SERVICE_ROLE_KEY || "",
  geminiKey: () => process.env.GEMINI_API_KEY || "",
  geminiModel: () => process.env.GEMINI_MODEL || "gemini-flash-latest",
  resendKey: () => process.env.RESEND_API_KEY || "",
  emailFrom: () => process.env.EMAIL_FROM || "Freshroots Planning <onboarding@resend.dev>",
  killSwitchEmail: () => process.env.KILL_SWITCH_EMAIL || "",
  /** Monday digest recipient; defaults to the kill-switch address. */
  digestEmail: () => process.env.DIGEST_EMAIL || process.env.KILL_SWITCH_EMAIL || "",
  cronSecret: () => process.env.CRON_SECRET || "",
  appUrl: () =>
    process.env.APP_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3400"),
};

export function integrationStatus() {
  return {
    supabase: Boolean(env.supabaseUrl() && env.supabaseServiceKey()),
    gemini: Boolean(env.geminiKey()),
    email: Boolean(env.resendKey() && env.killSwitchEmail()),
    emailTo: env.killSwitchEmail() || null,
  };
}
