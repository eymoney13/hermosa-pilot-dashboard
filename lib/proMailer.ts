import "server-only";
import nodemailer from "nodemailer";
export function proMailer() {
  const user = process.env.PRO_ACTIVATION_EMAIL_FROM;
  const password = process.env.GMAIL_APP_PASSWORD;
  if (!user || !password) throw new Error("Pro email is not configured");
  return nodemailer.createTransport({ service: "gmail", auth: { user, pass: password.replace(/\s+/g, "") } });
}
