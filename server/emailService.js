// server/emailService.js
// Dedicated Email Service for Subscription Lifecycle & Expiry Notifications
// Responsible for "WHAT to send" (HTML & Text Templates, Styling, CTAs, Mailer Delivery)

const nodemailer = require("nodemailer");
const pool = require("../db");

// Configure Zoho / SMTP Transporter
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || "smtp.zoho.in",
  port: parseInt(process.env.SMTP_PORT, 10) || 465,
  secure: process.env.SMTP_SECURE === "false" ? false : true,
  auth: {
    user: process.env.ZOHO_EMAIL || process.env.SMTP_USER || "vigomerge@zohomail.in",
    pass: process.env.ZOHO_APP_PASSWORD || process.env.SMTP_PASS || "",
  },
});

const SENDER_EMAIL = process.env.ZOHO_EMAIL || process.env.SMTP_USER || "vigomerge@zohomail.in";
const SENDER_NAME = process.env.APP_NAME || "Sculpt & Strive Fitness";
const APP_URL = process.env.APP_URL || "http://localhost:5173";
const ADMIN_URL = process.env.ADMIN_URL || "http://localhost:5174";

/**
 * 1. Customer Expiry Reminder Email Template
 * Dispatched for 7-day, 1-day, and on-expiry milestones
 */
function getCustomerExpiryEmailHtml({ customerName, planName, expiryDate, daysLeft, renewUrl, type }) {
  const isExpired = type === 'expired' || daysLeft <= 0;
  const isUrgent = type === '1_day_reminder' || daysLeft === 1;

  const headerBg = isExpired ? '#EF4444' : isUrgent ? '#F59E0B' : '#6366F1';
  const headerTitle = isExpired 
    ? 'Subscription Expired' 
    : isUrgent 
    ? 'Urgent: Subscription Ending Tomorrow' 
    : 'Your Subscription is Ending Soon';
  
  const subText = isExpired
    ? `Your subscription expired on <strong>${expiryDate}</strong>. Renew today to restore your session access.`
    : `Your subscription is ending on <strong>${expiryDate}</strong> (${daysLeft} ${daysLeft === 1 ? 'day' : 'days'} remaining).`;

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px; color: #1E293B; }
    .card { max-width: 540px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    .header { background: ${headerBg}; padding: 32px 24px; text-align: center; color: #FFFFFF; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: -0.02em; }
    .content { padding: 32px 28px; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0F172A; }
    .message { font-size: 14px; line-height: 1.6; color: #475569; margin-bottom: 24px; }
    .plan-box { background: #F1F5F9; border-radius: 12px; padding: 20px; margin-bottom: 28px; border-left: 4px solid ${headerBg}; }
    .plan-row { display: flex; justify-content: space-between; margin-bottom: 8px; font-size: 14px; }
    .plan-row:last-child { margin-bottom: 0; }
    .plan-label { color: #64748B; font-weight: 500; }
    .plan-val { color: #0F172A; font-weight: 600; }
    .btn-container { text-align: center; margin: 30px 0 10px; }
    .btn { display: inline-block; background: #6366F1; color: #FFFFFF !important; font-weight: 600; font-size: 15px; padding: 14px 32px; border-radius: 10px; text-decoration: none; box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3); }
    .footer { text-align: center; font-size: 12px; color: #94A3B8; padding: 20px; border-top: 1px solid #F1F5F9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>${headerTitle}</h1>
    </div>
    <div class="content">
      <div class="greeting">Hi ${customerName || 'Member'},</div>
      <div class="message">
        ${subText}<br><br>
        Please renew your subscription to continue your workout sessions and personal training without interruption.
      </div>
      
      <div class="plan-box">
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 6px 0; color: #64748B; font-size: 14px;"><strong>Plan:</strong></td>
            <td style="padding: 6px 0; color: #0F172A; font-size: 14px; font-weight: 600; text-align: right;">${planName || '1 Month Plan'}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; color: #64748B; font-size: 14px;"><strong>Expiry Date:</strong></td>
            <td style="padding: 6px 0; color: #0F172A; font-size: 14px; font-weight: 600; text-align: right;">${expiryDate}</td>
          </tr>
        </table>
      </div>

      <div class="btn-container">
        <a href="${renewUrl || APP_URL + '/billing'}" class="btn">Renew Now</a>
      </div>
    </div>
    <div class="footer">
      ${SENDER_NAME} · Dedicated to your fitness & wellness<br>
      Need assistance? Reply directly to this email.
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * 2. Admin Expiry Alert Email Template
 * Dispatched to notify administrators regarding member renewal status
 */
function getAdminExpiryEmailHtml({ customerName, customerEmail, customerPhone, planName, expiryDate, daysLeft, profileUrl, type }) {
  const isExpired = type === 'expired' || daysLeft <= 0;
  const isUrgent = type === '1_day_reminder' || daysLeft === 1;

  const headerBg = isExpired ? '#DC2626' : isUrgent ? '#D97706' : '#4F46E5';
  const badgeTitle = isExpired 
    ? 'Subscription Expired' 
    : isUrgent 
    ? 'Expiring in 24 Hours' 
    : 'Expiring in 7 Days';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px; color: #1E293B; }
    .card { max-width: 560px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    .header { background: ${headerBg}; padding: 24px 24px; color: #FFFFFF; }
    .header h2 { margin: 0; font-size: 18px; font-weight: 700; }
    .content { padding: 28px 24px; }
    .info-table { width: 100%; border-collapse: collapse; margin: 20px 0; background: #F8FAFC; border-radius: 12px; border: 1px solid #E2E8F0; overflow: hidden; }
    .info-table td { padding: 12px 16px; border-bottom: 1px solid #E2E8F0; font-size: 14px; }
    .info-table tr:last-child td { border-bottom: none; }
    .info-label { color: #64748B; width: 35%; font-weight: 500; }
    .info-val { color: #0F172A; font-weight: 600; }
    .btn-container { text-align: center; margin: 25px 0 10px; }
    .btn { display: inline-block; background: #1E293B; color: #FFFFFF !important; font-weight: 600; font-size: 14px; padding: 12px 28px; border-radius: 8px; text-decoration: none; }
    .footer { text-align: center; font-size: 12px; color: #94A3B8; padding: 16px; border-top: 1px solid #F1F5F9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>🔔 Member Subscription Expiry Alert</h2>
      <div style="font-size: 13px; opacity: 0.9; margin-top: 4px;">Status: ${badgeTitle}</div>
    </div>
    <div class="content">
      <p style="font-size: 14px; color: #475569; margin: 0 0 16px;">
        A member subscription requires follow-up. Here are the renewal details:
      </p>

      <table class="info-table">
        <tr>
          <td class="info-label">Customer:</td>
          <td class="info-val">${customerName || 'N/A'}</td>
        </tr>
        <tr>
          <td class="info-label">Email:</td>
          <td class="info-val">${customerEmail || 'N/A'}</td>
        </tr>
        ${customerPhone ? `<tr><td class="info-label">Phone:</td><td class="info-val">${customerPhone}</td></tr>` : ''}
        <tr>
          <td class="info-label">Plan:</td>
          <td class="info-val">${planName || '1 Month Plan'}</td>
        </tr>
        <tr>
          <td class="info-label">Expiry Date:</td>
          <td class="info-val">${expiryDate}</td>
        </tr>
      </table>

      <div class="btn-container">
        <a href="${profileUrl || ADMIN_URL + '/subscriptions'}" class="btn">View Member Profile</a>
      </div>
    </div>
    <div class="footer">
      ${SENDER_NAME} Automated CRM Notification Engine
    </div>
  </div>
</body>
</html>
  `;
}

/**
 * Send Customer Subscription Expiry Email
 */
async function sendCustomerExpiryEmail({ customerEmail, customerName, planName, expiryDate, daysLeft, type = '7_day_reminder' }) {
  if (!customerEmail) {
    console.warn("[EmailService] No customer email provided, skipping email dispatch.");
    return { success: false, reason: "No email provided" };
  }

  const isExpired = type === 'expired' || daysLeft <= 0;
  const isUrgent = type === '1_day_reminder' || daysLeft === 1;

  const subject = isExpired
    ? `❌ Your ${planName || 'Fitness'} Subscription Has Expired`
    : isUrgent
    ? `🚨 Final Reminder: Your ${planName || 'Fitness'} Subscription Ends Tomorrow`
    : `⏳ Reminder: Your ${planName || 'Fitness'} Subscription is Ending on ${expiryDate}`;

  const html = getCustomerExpiryEmailHtml({
    customerName,
    planName,
    expiryDate,
    daysLeft,
    renewUrl: `${APP_URL}/billing`,
    type
  });

  const text = `Hi ${customerName || 'Member'},\n\nYour subscription is ending soon.\n\nPlan: ${planName || '1 Month'}\nExpiry: ${expiryDate}\n\nPlease renew your subscription to continue your sessions.\n\nRenew Now: ${APP_URL}/billing\n\n- ${SENDER_NAME}`;

  try {
    const info = await transporter.sendMail({
      from: `"${SENDER_NAME}" <${SENDER_EMAIL}>`,
      to: customerEmail,
      subject,
      text,
      html,
    });

    console.log(`📧 [Customer Email Sent] To: ${customerEmail} | Subject: "${subject}" | MsgId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [Customer Email Failed] To: ${customerEmail} | Error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send Admin Subscription Expiry Alert Email
 */
async function sendAdminExpiryEmail({ adminEmail, customerName, customerEmail, customerPhone, planName, expiryDate, daysLeft, type = '7_day_reminder' }) {
  const targetEmail = adminEmail || SENDER_EMAIL;

  const subject = `🔔 Member Expiry Alert: ${customerName || 'Member'} (${planName || '1 Month'}) - ${expiryDate}`;

  const html = getAdminExpiryEmailHtml({
    customerName,
    customerEmail,
    customerPhone,
    planName,
    expiryDate,
    daysLeft,
    profileUrl: `${ADMIN_URL}/subscriptions`,
    type
  });

  const text = `Member Subscription Expiry Alert\n\nCustomer: ${customerName}\nEmail: ${customerEmail}\nPlan: ${planName}\nExpiry: ${expiryDate}\n\nView Member Profile: ${ADMIN_URL}/subscriptions\n\n- ${SENDER_NAME} CRM`;

  try {
    const info = await transporter.sendMail({
      from: `"${SENDER_NAME} System" <${SENDER_EMAIL}>`,
      to: targetEmail,
      subject,
      text,
      html,
    });

    console.log(`📧 [Admin Alert Email Sent] To: ${targetEmail} | Customer: ${customerName} | MsgId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [Admin Alert Email Failed] Error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Helper to notify all super admins via email
 */
async function notifyAllAdminsByEmail(data) {
  try {
    const superAdmins = await pool.query(
      `SELECT email, name FROM users WHERE role IN ('super_admin', 'Super Admin', 'org_admin', 'Org Admin')`
    );

    const emailList = superAdmins.rows.filter(u => u.email && u.email.includes('@'));
    if (emailList.length === 0) {
      // Fallback to sender email
      return [await sendAdminExpiryEmail({ ...data, adminEmail: SENDER_EMAIL })];
    }

    const results = [];
    for (const admin of emailList) {
      const res = await sendAdminExpiryEmail({ ...data, adminEmail: admin.email });
      results.push(res);
    }
    return results;
  } catch (err) {
    console.error("notifyAllAdminsByEmail error:", err);
    return [];
  }
}

/**
 * Send Missed Follow-up Outreach Email to Customer
 */
async function sendLeadFollowupMissedEmail({ leadEmail, leadName, companyName, salespersonName }) {
  if (!leadEmail) return { success: false, reason: "No email provided" };

  const firmName = companyName || SENDER_NAME;
  const repName = salespersonName || "our team";
  const subject = `Following up on our conversation - ${firmName}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px; color: #1E293B; }
    .card { max-width: 540px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    .header { background: #4F46E5; padding: 28px 24px; text-align: center; color: #FFFFFF; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .content { padding: 32px 28px; font-size: 14px; line-height: 1.6; color: #475569; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0F172A; }
    .footer { text-align: center; font-size: 12px; color: #94A3B8; padding: 20px; border-top: 1px solid #F1F5F9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>We missed our scheduled follow-up</h1>
    </div>
    <div class="content">
      <div class="greeting">Hi ${leadName || 'there'},</div>
      <p>We had a scheduled follow-up planned, but we may have missed connecting with you.</p>
      <p>We want to make sure all your questions are answered and that you get the best guidance for your goals.</p>
      <p>Please reply directly to this email or let us know a convenient time to reconnect.</p>
      <p>Best regards,<br><strong>${repName}</strong><br>${firmName}</p>
    </div>
    <div class="footer">
      ${firmName} · Dedicated to your success
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${leadName || 'there'},\n\nWe had a scheduled follow-up planned, but we may have missed connecting with you.\n\nWe want to ensure all your questions are answered. Please reply to this email or let us know when it's convenient to reconnect.\n\nBest regards,\n${repName}\n${firmName}`;

  try {
    const info = await transporter.sendMail({
      from: `"${firmName}" <${SENDER_EMAIL}>`,
      to: leadEmail,
      subject,
      text,
      html
    });
    console.log(`📧 [Missed Followup Email Sent] To: ${leadEmail} | MsgId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [Missed Followup Email Failed] To: ${leadEmail} | Error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send Re-engagement Email for Inactive Leads
 */
async function sendLeadReengagementEmail({ leadEmail, leadName, companyName, salespersonName }) {
  if (!leadEmail) return { success: false, reason: "No email provided" };

  const firmName = companyName || SENDER_NAME;
  const repName = salespersonName || "our team";
  const subject = `Checking in: Are you still interested in reaching your goals with ${firmName}?`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px; color: #1E293B; }
    .card { max-width: 540px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    .header { background: #0EA5E9; padding: 28px 24px; text-align: center; color: #FFFFFF; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .content { padding: 32px 28px; font-size: 14px; line-height: 1.6; color: #475569; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0F172A; }
    .footer { text-align: center; font-size: 12px; color: #94A3B8; padding: 20px; border-top: 1px solid #F1F5F9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Checking in on your plans</h1>
    </div>
    <div class="content">
      <div class="greeting">Hi ${leadName || 'there'},</div>
      <p>It's been a little while since we last spoke, and I wanted to check in to see how you're doing.</p>
      <p>Whether you're ready to get started or just have a few questions before making a decision, we're here to help.</p>
      <p>Reply directly to this email and let me know how we can best support you!</p>
      <p>Warm regards,<br><strong>${repName}</strong><br>${firmName}</p>
    </div>
    <div class="footer">
      ${firmName} · Here to support your journey
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${leadName || 'there'},\n\nIt has been a little while since we last spoke, and I wanted to check in to see how you're doing.\n\nWhether you're ready to get started or just have a few questions, reply to this email and let us know!\n\nWarm regards,\n${repName}\n${firmName}`;

  try {
    const info = await transporter.sendMail({
      from: `"${firmName}" <${SENDER_EMAIL}>`,
      to: leadEmail,
      subject,
      text,
      html
    });
    console.log(`📧 [Reengagement Email Sent] To: ${leadEmail} | MsgId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [Reengagement Email Failed] To: ${leadEmail} | Error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send Welcome / Outreach Email to New Uncontacted Leads
 */
async function sendNewLeadWelcomeEmail({ leadEmail, leadName, companyName, salespersonName }) {
  if (!leadEmail) return { success: false, reason: "No email provided" };

  const firmName = companyName || SENDER_NAME;
  const repName = salespersonName || "our dedicated advisors";
  const subject = `Welcome! Thank you for reaching out to ${firmName}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px; color: #1E293B; }
    .card { max-width: 540px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    .header { background: #10B981; padding: 28px 24px; text-align: center; color: #FFFFFF; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 700; }
    .content { padding: 32px 28px; font-size: 14px; line-height: 1.6; color: #475569; }
    .greeting { font-size: 16px; font-weight: 600; margin-bottom: 12px; color: #0F172A; }
    .footer { text-align: center; font-size: 12px; color: #94A3B8; padding: 20px; border-top: 1px solid #F1F5F9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h1>Thank you for connecting with us!</h1>
    </div>
    <div class="content">
      <div class="greeting">Hi ${leadName || 'there'},</div>
      <p>Thank you for expressing interest in ${firmName}! We received your inquiry and wanted to reach out right away.</p>
      <p>One of our team members is reviewing your requirements and will connect with you shortly. If you have any urgent questions or preferred times to speak, simply reply to this email.</p>
      <p>Looking forward to connecting soon!</p>
      <p>Best regards,<br><strong>${repName}</strong><br>${firmName}</p>
    </div>
    <div class="footer">
      ${firmName} · We look forward to working with you
    </div>
  </div>
</body>
</html>`;

  const text = `Hi ${leadName || 'there'},\n\nThank you for reaching out to ${firmName}! We received your inquiry and our team is eager to help.\n\nPlease reply directly to this email with any questions or preferred times to connect.\n\nBest regards,\n${repName}\n${firmName}`;

  try {
    const info = await transporter.sendMail({
      from: `"${firmName}" <${SENDER_EMAIL}>`,
      to: leadEmail,
      subject,
      text,
      html
    });
    console.log(`📧 [New Lead Welcome Email Sent] To: ${leadEmail} | MsgId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [New Lead Welcome Email Failed] To: ${leadEmail} | Error:`, error.message);
    return { success: false, error: error.message };
  }
}

/**
 * Send Salesperson Response Email to Customer
 */
async function sendSalespersonResponseEmail({ leadEmail, leadName, companyName, salespersonName, messageText }) {
  if (!leadEmail) return { success: false, reason: "No email provided" };

  const firmName = companyName || SENDER_NAME;
  const repName = salespersonName || "our team";
  const subject = `Update from ${repName} at ${firmName}`;
  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #F8FAFC; margin: 0; padding: 20px; color: #1E293B; }
    .card { max-width: 540px; margin: 0 auto; background: #FFFFFF; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 20px rgba(0,0,0,0.06); border: 1px solid #E2E8F0; }
    .header { background: #4F46E5; padding: 24px 24px; color: #FFFFFF; }
    .header h2 { margin: 0; font-size: 18px; font-weight: 700; }
    .content { padding: 28px 24px; font-size: 14px; line-height: 1.6; color: #334155; }
    .msg-box { background: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 10px; padding: 16px; margin: 16px 0; white-space: pre-wrap; font-size: 14px; color: #0F172A; }
    .footer { text-align: center; font-size: 12px; color: #94A3B8; padding: 16px; border-top: 1px solid #F1F5F9; }
  </style>
</head>
<body>
  <div class="card">
    <div class="header">
      <h2>Message from ${repName}</h2>
    </div>
    <div class="content">
      <p>Hi ${leadName || 'there'},</p>
      <div class="msg-box">${messageText.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
      <p>If you have any further questions, simply reply directly to this email.</p>
      <p>Best regards,<br><strong>${repName}</strong><br>${firmName}</p>
    </div>
    <div class="footer">
      ${firmName}
    </div>
  </div>
</body>
</html>`;

  try {
    const info = await transporter.sendMail({
      from: `"${repName} - ${firmName}" <${SENDER_EMAIL}>`,
      to: leadEmail,
      subject,
      text: `Hi ${leadName || 'there'},\n\n${messageText}\n\nBest regards,\n${repName}\n${firmName}`,
      html
    });
    console.log(`📧 [Salesperson Reply Email Sent] To: ${leadEmail} | MsgId: ${info.messageId}`);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error(`❌ [Salesperson Reply Email Failed] To: ${leadEmail} | Error:`, error.message);
    return { success: false, error: error.message };
  }
}

module.exports = {
  sendCustomerExpiryEmail,
  sendAdminExpiryEmail,
  notifyAllAdminsByEmail,
  getCustomerExpiryEmailHtml,
  getAdminExpiryEmailHtml,
  sendLeadFollowupMissedEmail,
  sendLeadReengagementEmail,
  sendNewLeadWelcomeEmail,
  sendSalespersonResponseEmail
};
