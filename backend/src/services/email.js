// email.js — Gmail SMTP via Nodemailer
//
// ─── Setup (2 minutes) ───────────────────────────────────────────────────────
//  1. Go to Google Account → Security → 2-Step Verification → enable it
//  2. Go to Google Account → Security → App Passwords
//  3. Generate a new App Password (select "Mail" + "Windows Computer")
//  4. Copy the 16-character password (no spaces)
//
// ─── .env ────────────────────────────────────────────────────────────────────
//  GMAIL_USER=youraddress@gmail.com
//  GMAIL_APP_PASSWORD=xxxx xxxx xxxx xxxx   ← 16-char app password
//  FROM_NAME=Autohire-Pro Recruitment

import nodemailer from 'nodemailer';

/* ─────────────────────────────────────────────
   Internal helper – send via Gmail SMTP
   Reads env vars inside function so they are
   always fresh after .env is loaded
───────────────────────────────────────────── */
async function sendEmail({ to, subject, html }) {
  const GMAIL_USER         = process.env.GMAIL_USER;
  const GMAIL_APP_PASSWORD = process.env.GMAIL_APP_PASSWORD;
  const FROM_NAME          = process.env.FROM_NAME || 'Autohire-Pro Recruitment';

  if (!GMAIL_USER || !GMAIL_APP_PASSWORD) {
    console.warn('[Email] GMAIL_USER or GMAIL_APP_PASSWORD not set — logging only');
    console.log(`[Email][LOG] To: ${to} | Subject: ${subject}`);
    return { logged: true };
  }

  try {
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: GMAIL_USER,
        pass: GMAIL_APP_PASSWORD,
      },
    });

    const info = await transporter.sendMail({
      from: `"${FROM_NAME}" <${GMAIL_USER}>`,
      to,
      subject,
      html,
    });

    console.log(`[Email] Sent → ${to} | messageId: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] Error → ${to} |`, err.message);
    return { error: err.message };
  }
}

/* ─────────────────────────────────────────────
   Shared HTML wrapper
───────────────────────────────────────────── */
function emailWrapper(bodyHtml) {
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;
                padding:24px;border:1px solid #E5E7EB;border-radius:8px;background:#ffffff;">
      <h2 style="color:#0A66C2;margin-bottom:4px;">Autohire-Pro Recruitment</h2>
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:12px 0;" />
      ${bodyHtml}
      <p style="margin-top:20px;">Best regards,<br/><strong>Autohire-Pro Recruitment Team</strong></p>
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:20px 0 8px;" />
      <p style="font-size:0.75rem;color:#9CA3AF;text-align:center;">
        This is an automated message from Autohire-Pro. Please do not reply to this email.
      </p>
    </div>`;
}

/* ─────────────────────────────────────────────
   1. Welcome email (called on registration)
───────────────────────────────────────────── */
export async function sendWelcomeEmail({ to, userName, role, userId }) {
  const roleLabel = {
    candidate:      'Candidate',
    hrManager:      'HR Manager',
    recruiterAdmin: 'Recruiter Admin',
  }[role] ?? role;

  const subject = `Welcome to Autohire-Pro, ${userName || 'there'}!`;
  const html = emailWrapper(`
    <p>Dear <strong>${userName || 'User'}</strong>,</p>
    <p>Welcome to <strong>Autohire-Pro</strong>! Your account has been successfully created.</p>
    <table style="width:100%;border-collapse:collapse;margin:12px 0;">
      <tr>
        <td style="padding:8px 12px;background:#F3F4F6;border-radius:6px;font-weight:600;width:40%;">Role</td>
        <td style="padding:8px 12px;background:#F3F4F6;border-radius:6px;">${roleLabel}</td>
      </tr>
      <tr>
        <td style="padding:8px 12px;font-weight:600;">Email</td>
        <td style="padding:8px 12px;">${to}</td>
      </tr>
    </table>
    <p>You can now log in and explore the platform. If you have any questions, feel free to reach out.</p>
  `);

  return sendEmail({ to, subject, html });
}

/* ─────────────────────────────────────────────
   2. Stage advancement email
───────────────────────────────────────────── */
const STAGE_LABELS = {
  assessment: 'Assessment Shortlisting',
  interview:  'Interview Shortlisting',
  offer:      'Offer Release',
  hired:      'Hired',
};

export async function sendStageEmail({ to, candidateName, jobTitle, stage }) {
  const stageLabel = STAGE_LABELS[stage] ?? stage;

  const subject = `Autohire-Pro – You've been shortlisted for ${stageLabel}!`;
  const html = emailWrapper(`
    <p>Dear <strong>${candidateName || 'Candidate'}</strong>,</p>
    <p>Congratulations! You have been <strong>shortlisted</strong> and advanced to the
       <strong>${stageLabel}</strong> stage for the position:</p>
    <p style="font-size:1.1rem;font-weight:600;color:#1F2937;padding:8px 12px;
              background:#F3F4F6;border-radius:6px;">${jobTitle}</p>
    <p>Our team will reach out to you shortly with further details.
       Please ensure your contact information is up to date on the platform.</p>
  `);

  return sendEmail({ to, subject, html });
}

/* ─────────────────────────────────────────────
   3. Batch stage emails
───────────────────────────────────────────── */
export async function sendBatchStageEmails(candidates, jobTitle, stage) {
  const results = await Promise.allSettled(
    candidates.map((c) =>
      sendStageEmail({ to: c.email, candidateName: c.name, jobTitle, stage })
    )
  );

  return results.map((r, i) => ({
    email: candidates[i].email,
    ...(r.status === 'fulfilled' ? r.value : { error: r.reason?.message ?? 'Unknown error' }),
  }));
}

/* ─────────────────────────────────────────────
   4. Application confirmation email
───────────────────────────────────────────── */
export async function sendApplicationConfirmation({ to, candidateName, jobTitle, jobId }) {
  const subject = `Autohire-Pro – Application Received for ${jobTitle}`;
  const html = emailWrapper(`
    <p>Dear <strong>${candidateName || 'Candidate'}</strong>,</p>
    <p>Thank you for your interest! We have successfully received your application for:</p>
    <p style="font-size:1.1rem;font-weight:600;color:#1F2937;padding:8px 12px;
              background:#F3F4F6;border-radius:6px;">${jobTitle}</p>
    <p>Your application is now under review. Our recruitment team will carefully evaluate
       your qualifications and experience. We will contact you if your profile matches
       our requirements.</p>
    <p>Due to the high volume of applications, this may take some time. We appreciate
       your patience.</p>
  `);

  return sendEmail({ to, subject, html });
}

/* ─────────────────────────────────────────────
   5. Rejection email
───────────────────────────────────────────── */
export async function sendRejectionEmail({ to, candidateName, jobTitle }) {
  const subject = `Autohire-Pro – Update on your application for ${jobTitle}`;
  const html = emailWrapper(`
    <p>Dear <strong>${candidateName || 'Candidate'}</strong>,</p>
    <p>Thank you for your time and interest in the position:</p>
    <p style="font-size:1.1rem;font-weight:600;color:#1F2937;padding:8px 12px;
              background:#F3F4F6;border-radius:6px;">${jobTitle}</p>
    <p>After careful consideration, we have decided to move forward with other candidates
       whose profiles more closely match our current requirements.</p>
    <p>We genuinely appreciate your effort and encourage you to apply for future openings
       that match your skills. We wish you all the best in your job search.</p>
  `);

  return sendEmail({ to, subject, html });
}