"use server";

import { Resend } from "resend";

interface SendWelcomeArgs {
  email: string;
  parentName: string;
  childrenNames: string[];
}

interface SendResult {
  ok: boolean;
  error?: string;
  skipped?: boolean;
}

export async function sendParentWelcomeEmail(
  args: SendWelcomeArgs
): Promise<SendResult> {
  const apiKey = process.env.RESEND_API_KEY;
  const fromAddress = process.env.RESEND_FROM ?? "Junior 5-a-Side <noreply@junior.boundarylive.app>";
  const whatsappLink = process.env.WHATSAPP_GROUP_URL ?? "";

  // Don't fail registration if the email side isn't configured yet.
  if (!apiKey) {
    return { ok: true, skipped: true };
  }

  const resend = new Resend(apiKey);

  const kidsList = args.childrenNames.length
    ? args.childrenNames.map((n) => `<li>${escapeHtml(n)}</li>`).join("")
    : "";

  const whatsappBlock = whatsappLink
    ? `<p>Join our WhatsApp group for fixtures, announcements and tournament-day updates:</p>
       <p><a href="${escapeHtml(whatsappLink)}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:9999px;">Join the WhatsApp group</a></p>`
    : `<p>We'll share a WhatsApp group invite link with you shortly so you don't miss any tournament-day updates.</p>`;

  const html = `<!doctype html>
<html><body style="font-family:-apple-system,Segoe UI,Roboto,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#0b1f17;">
  <h1 style="color:#114232;margin-top:0;">Thanks for registering!</h1>
  <p>Hi ${escapeHtml(args.parentName)},</p>
  <p>You've successfully registered ${args.childrenNames.length === 1 ? "your child" : "your children"} for the Junior 5-a-Side cricket tournament.</p>
  ${kidsList ? `<ul style="background:#f5f5f5;padding:12px 20px;border-radius:12px;">${kidsList}</ul>` : ""}
  ${whatsappBlock}
  <p>If you need to update your details, you can sign in any time at <a href="https://junior.boundarylive.app">junior.boundarylive.app</a>.</p>
  <p style="color:#6b7280;font-size:12px;margin-top:32px;">Junior 5-a-Side &middot; Bledlow Ridge Cricket Club</p>
</body></html>`;

  try {
    const { error } = await resend.emails.send({
      from: fromAddress,
      to: args.email,
      subject: "You're registered — Junior 5-a-Side",
      html,
    });
    if (error) {
      console.error("Resend error", error);
      return { ok: false, error: error.message };
    }
    return { ok: true };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Unknown error";
    console.error("Resend exception", message);
    return { ok: false, error: message };
  }
}

function escapeHtml(s: string): string {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
