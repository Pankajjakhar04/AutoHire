import nodemailer from 'nodemailer';

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT || '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    console.warn('[Email] SMTP not configured – emails will be logged to console only.');
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass }
  });

  return transporter;
}

/**
 * Send a recruitment stage advancement email to a candidate.
 * Falls back to console.log if SMTP is not configured.
 */
export async function sendStageEmail({ to, candidateName, jobTitle, stage }) {
  const stageLabels = {
    assessment: 'Assessment Shortlisting',
    interview: 'Interview Shortlisting',
    offer: 'Offer Release',
    hired: 'Hired'
  };

  const stageLabel = stageLabels[stage] || stage;
  const subject = `AutoHire – You've been shortlisted for ${stageLabel}!`;
  const html = `
    <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #E5E7EB; border-radius: 8px;">
      <h2 style="color: #0A66C2; margin-bottom: 4px;">AutoHire Recruitment</h2>
      <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 12px 0;" />
      <p>Dear <strong>${candidateName || 'Candidate'}</strong>,</p>
      <p>Congratulations! We are pleased to inform you that you have been <strong>shortlisted</strong> and advanced to the <strong>${stageLabel}</strong> stage for the position:</p>
      <p style="font-size: 1.1rem; font-weight: 600; color: #1F2937; padding: 8px 12px; background: #F3F4F6; border-radius: 6px;">${jobTitle}</p>
      <p>Our team will reach out to you shortly with further details. Please ensure your contact information is up to date on the platform.</p>
      <p style="margin-top: 20px;">Best regards,<br/><strong>AutoHire Recruitment Team</strong></p>
    </div>
  `;

  const t = getTransporter();
  if (!t) {
    console.log(`[Email][LOG] To: ${to} | Subject: ${subject}`);
    console.log(`[Email][LOG] ${candidateName} advanced to ${stageLabel} for "${jobTitle}"`);
    return { logged: true };
  }

  try {
    const info = await t.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      html
    });
    console.log(`[Email] Sent to ${to}: ${info.messageId}`);
    return { sent: true, messageId: info.messageId };
  } catch (err) {
    console.error(`[Email] Failed to send to ${to}:`, err.message);
    return { error: err.message };
  }
}

/**
 * Send batch emails (non-blocking — fires & forgets so the API stays fast).
 */
export async function sendBatchStageEmails(candidates, jobTitle, stage) {
  const results = [];
  for (const c of candidates) {
    const result = await sendStageEmail({
      to: c.email,
      candidateName: c.name,
      jobTitle,
      stage
    });
    results.push({ email: c.email, ...result });
  }
  return results;
}
