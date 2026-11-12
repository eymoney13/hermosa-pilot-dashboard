// Table layout and inline styles keep this email readable across mail clients.
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, char => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"}[char]!));
}
export function purchaseEmail(links: string[], existingAccount: boolean, options: { freeUntil?: string } = {}) {
  const action = existingAccount ? "Open Neptune Pro" : "Activate Neptune Pro";
  const date = options.freeUntil ? new Date(options.freeUntil).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "America/Los_Angeles" }) : null;
  const confirmation = date ? "No card needed. No additional payment required." : "Already paid. No additional payment required.";
  const intro = date ? `Your free Neptune Pro is ready. No card needed. Your access runs through ${date}. Finish signing in or setting up your account to activate it.` : existingAccount
    ? "Your payment is confirmed. Sign in with your checkout email to access your Neptune Pro purchase."
    : "Your payment is confirmed. Finish setting up your account to unlock forecasts, water-quality history, deeper insights, and beach alerts.";
  return {
    subject: existingAccount ? "Your Neptune Pro access link" : "Welcome to Neptune Pro: activate your account",
    text: `NEPTUNE PRO\n\n${intro}\n\n${action}:\n${links.join("\n")}\n\n${confirmation}\nKeep this private link to yourself. If the link has expired, request another from Neptune’s purchase recovery page.`,
    html: `<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><meta charset="utf-8"><title>Neptune Pro</title></head><body style="margin:0;background:#f4f6f5;color:#183b3b;font-family:Arial,Helvetica,sans-serif"><div style="display:none;max-height:0;overflow:hidden">${escapeHtml(intro)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:32px 16px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-top:4px solid #176b65"><tr><td style="padding:36px 28px"><p style="margin:0 0 32px;font-size:14px;font-weight:700;letter-spacing:2px;color:#176b65">NEPTUNE PRO</p><h1 style="margin:0 0 20px;font-size:30px;line-height:1.2;font-weight:600">Know what you’re going into.</h1><p style="font-size:16px;line-height:1.7;margin:0 0 28px">${intro}</p>${links.map(link => `<p style="margin:0 0 20px"><a href="${escapeHtml(link)}" style="display:inline-block;background:#176b65;color:#ffffff;text-decoration:none;font-size:16px;font-weight:700;padding:16px 24px;border-radius:6px">${action}</a></p>`).join("")}<p style="font-size:14px;line-height:1.6;margin:24px 0 0">${confirmation}</p><hr style="border:0;border-top:1px solid #e2e9e6;margin:28px 0"><p style="font-size:12px;line-height:1.7;color:#617571;margin:0">Keep this private link to yourself. If the link has expired, request another from Neptune’s purchase recovery page.</p></td></tr></table><p style="font-size:12px;color:#617571">Project Neptune · Know the water. Enjoy the coast.</p></td></tr></table></body></html>`,
  };
}
