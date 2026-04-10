/**
 * One-off script to send email design previews.
 * Run: bun run apps/mesh/src/auth/send-preview-emails.ts
 */

import {
  emailButton,
  emailOtpCode,
  emailParagraph,
  emailTemplate,
} from "./email-template";

const RESEND_API_KEY = process.env.RESEND_API_KEY;
const BASE_URL = process.env.BASE_URL ?? "https://studio.deco.cx";
const TO = "valls@deco.cx";
const FROM = "deco Studio <onboarding@resend.dev>";

if (!RESEND_API_KEY) {
  console.error("Missing RESEND_API_KEY");
  process.exit(1);
}

async function send(subject: string, html: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from: FROM, to: TO, subject, html }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

const emails = [
  {
    subject: "[Preview] Invite email",
    html: emailTemplate({ baseUrl: BASE_URL,
      preheader: "Rafael Valls has invited you to join Acme Corp on deco Studio.",
      heading: "You've been invited",
      subheading:
        "<strong>Rafael Valls</strong> has invited you to join <strong>Acme Corp</strong> on deco Studio.",
      body: emailButton("Accept invitation", "https://example.com/accept"),
      footnote:
        "If you weren\u2019t expecting an invitation, you can safely ignore this email.",
    }),
  },
  {
    subject: "[Preview] OTP email",
    html: emailTemplate({ baseUrl: BASE_URL,
      preheader: "Your sign in code is 482 916",
      heading: "Sign in code",
      subheading: "Enter the code below to sign in to your account.",
      body:
        emailOtpCode("482 916") +
        emailParagraph(
          "This code expires in <strong>5 minutes</strong>. Do not share it with anyone.",
          true,
        ),
      footnote:
        "If you didn\u2019t request this code, you can safely ignore this email.",
    }),
  },
  {
    subject: "[Preview] Password reset email",
    html: emailTemplate({ baseUrl: BASE_URL,
      preheader:
        "We received a request to reset the password on your deco Studio account.",
      heading: "Reset your password",
      subheading:
        "We received a password reset request for your account. Click the button below to choose a new password.",
      body:
        emailButton("Reset password", "https://example.com/reset") +
        emailParagraph(
          "This link expires in 24\u00a0hours. If you didn\u2019t request a password reset, no action is needed.",
          true,
        ),
      footnote:
        "If you didn\u2019t request a password reset, you can safely ignore this email.",
    }),
  },
  {
    subject: "[Preview] Magic link email",
    html: emailTemplate({ baseUrl: BASE_URL,
      preheader: "Click the button to securely sign in to your account.",
      heading: "Sign in to deco Studio",
      subheading:
        "We received a sign-in request for <strong>valls@deco.cx</strong>. Click the button below to continue.",
      body: emailButton("Sign in", "https://example.com/magic"),
      footnote:
        "If you didn\u2019t request this link, you can safely ignore this email. This link expires shortly.",
    }),
  },
];

for (const email of emails) {
  try {
    await send(email.subject, email.html);
    console.log(`Sent: ${email.subject}`);
  } catch (err) {
    console.error(`Failed: ${email.subject}`, err);
  }
}
