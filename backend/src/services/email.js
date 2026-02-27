import nodemailer from 'nodemailer';

// Universal SMTP configuration for Render deployment
const smtpHost = process.env.SMTP_HOST;
const smtpPort = parseInt(process.env.SMTP_PORT) || 587;
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;
const smtpFrom = process.env.SMTP_FROM;

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;
  
  if (!smtpUser || !smtpPass || !smtpFrom) {
    console.warn('[Email] SMTP not configured – set SMTP_USER, SMTP_PASS, and SMTP_FROM');
    return null;
  }

  // Universal SMTP transporter that works on Render
  _transporter = nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpPort === 465,
    auth: {
      user: smtpUser,
      pass: smtpPass,
    },
    tls: {
      rejectUnauthorized: false, // Critical for Render deployment
    },
    pool: true, // Connection pooling for better performance
    maxConnections: 5,
    maxMessages: 100,
  });

  return _transporter;
}

/* ─────────────────────────────────────────────
   Internal helper – send a single email
───────────────────────────────────────────── */
async function sendEmail({ to, subject, html }) {
  const transporter = getTransporter();

  if (!transporter) {
    console.log(`[Email][LOG] To: ${to} | Subject: ${subject}`);
    return { logged: true };
  }

  try {
    const mailOptions = {
      from: smtpFrom,
      to,
      subject,
      html,
    };

    const result = await transporter.sendMail(mailOptions);
    console.log(`[Email] Sent → ${to} | messageId: ${result.messageId}`);
    return { sent: true, messageId: result.messageId };
  } catch (err) {
    console.error(`[Email] Failed → ${to} |`, err.message);
    return { error: err.message };
  }
}

/* ─────────────────────────────────────────────
   Shared HTML wrapper
───────────────────────────────────────────── */
function emailWrapper(bodyHtml) {
  return `
    <div style="font-family:'Segoe UI',Arial,sans-serif;max-width:600px;margin:auto;
                padding:24px;border:1px solid #E5E7EB;border-radius:8px;">
      <h2 style="color:#0A66C2;margin-bottom:4px;">AutoHire Recruitment</h2>
      <hr style="border:none;border-top:1px solid #E5E7EB;margin:12px 0;" />
      ${bodyHtml}
      <p style="margin-top:20px;">Best regards,<br/><strong>AutoHire Recruitment Team</strong></p>
    </div>`;
}

/* ─────────────────────────────────────────────
   1. Stage advancement email
───────────────────────────────────────────── */
const STAGE_LABELS = {
  assessment: 'Assessment Shortlisting',
  interview:  'Interview Shortlisting',
  offer:      'Offer Release',
  hired:      'Hired',
};

export async function sendStageEmail({ to, candidateName, jobTitle, stage }) {
  const stageLabel = STAGE_LABELS[stage] ?? stage;

  const subject = `AutoHire – You've been shortlisted for ${stageLabel}!`;
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
   2. Batch stage emails  (non-blocking)
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
   3. Application confirmation email
───────────────────────────────────────────── */
export async function sendApplicationConfirmation({ to, candidateName, jobTitle, jobId }) {
  const subject = `AutoHire – Application Received for ${jobTitle}`;
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