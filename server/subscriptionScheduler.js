// server/subscriptionScheduler.js
// Automated Daily Subscription Expiry Notification Scheduler
// Runs every day at 08:00 AM (and on manual trigger)
// 1. Checks 7-day expiry -> sends 1 customer & 1 admin reminder -> sets reminder_7d_sent = true
// 2. Checks 1-day expiry -> sends 1 customer & 1 admin reminder -> sets reminder_1d_sent = true
// 3. Checks expiry day   -> marks status = 'expired' -> sends expiry notification -> sets reminder_0d_sent = true

const cron = require('node-cron');
const pool = require('../db');
const notificationService = require('./notificationService');
const emailService = require('./emailService');

/**
 * Format date for human-friendly notifications
 */
function formatExpiryDate(date) {
    if (!date) return 'soon';
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'soon';
    return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Main Daily Subscription Expiry Check & Notification Dispatcher
 */
async function runDailySubscriptionCheck() {
    const startTime = new Date();
    console.log(`\n========================================================`);
    console.log(`⏳ [Subscription Cron] Running Daily Expiry Check at ${startTime.toISOString()}`);
    console.log(`========================================================`);

    const summary = {
        checkedAt: startTime.toISOString(),
        reminders7dSent: 0,
        reminders1dSent: 0,
        expiredProcessed: 0,
        errors: []
    };

    try {
        // ──────────────────────────────────────────────────────────────
        // STEP 1: Check 7-Day Expiry (subscription_end within next 7 days and > 1 day)
        // ──────────────────────────────────────────────────────────────
        const res7d = await pool.query(`
            SELECT s.*, u.name as user_name, u.email as user_email, u.phone as user_phone
            FROM subscriptions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'active'
              AND (s.reminder_7d_sent IS NULL OR s.reminder_7d_sent = false)
              AND s.subscription_end IS NOT NULL
              AND s.subscription_end <= NOW() + INTERVAL '7 days'
              AND s.subscription_end > NOW() + INTERVAL '1 day'
        `);

        console.log(`[Subscription Cron] Found ${res7d.rows.length} subscription(s) expiring in 7 days.`);

        for (const sub of res7d.rows) {
            try {
                const customerName = sub.customer_name || sub.user_name || "Valued Member";
                const customerEmail = sub.customer_email || sub.user_email || "";
                const duration = sub.duration_months || 1;
                const planTitle = sub.plan_name || `${duration}-Month Fitness Subscription`;
                const expiryDateStr = formatExpiryDate(sub.subscription_end);

                // 1. Send Customer In-App Notification
                if (sub.user_id) {
                    await notificationService.createNotification(
                        sub.user_id,
                        'subscription_expiring_7d',
                        '⏳ Subscription Ending in 7 Days',
                        `Your ${planTitle} is ending on ${expiryDateStr}. Please renew your plan to continue your sessions uninterrupted.`,
                        '/billing',
                        'medium',
                        {
                            subscription_id: sub.id,
                            plan_name: planTitle,
                            duration_months: duration,
                            subscription_end: sub.subscription_end,
                            customer_email: customerEmail,
                            notification_type: '7_day_reminder'
                        }
                    );
                }

                // 2. Send Customer Email Notification
                if (customerEmail) {
                    await emailService.sendCustomerExpiryEmail({
                        customerEmail,
                        customerName,
                        planName: planTitle,
                        expiryDate: expiryDateStr,
                        daysLeft: 7,
                        type: '7_day_reminder'
                    });
                }

                // 3. Send Admin In-App & Email Alert
                await notificationService.notifySuperAdmins(
                    'subscription_expiring_7d',
                    `🔔 Renewal Alert: ${customerName}`,
                    `Customer ${customerName}'s subscription is ending on ${expiryDateStr}. Plan: ${duration} Month.`,
                    `/subscriptions`,
                    'medium',
                    {
                        subscription_id: sub.id,
                        customer_name: customerName,
                        customer_email: customerEmail,
                        plan_name: planTitle,
                        subscription_end: sub.subscription_end
                    }
                );

                await emailService.notifyAllAdminsByEmail({
                    customerName,
                    customerEmail,
                    customerPhone: sub.user_phone || sub.customer_phone || '',
                    planName: planTitle,
                    expiryDate: expiryDateStr,
                    daysLeft: 7,
                    type: '7_day_reminder'
                });

                // 4. Mark 7-day reminder as sent (prevents duplicate notification)
                await pool.query(
                    `UPDATE subscriptions 
                     SET reminder_7d_sent = true, updated_at = NOW() 
                     WHERE id = $1`,
                    [sub.id]
                );

                summary.reminders7dSent++;
                console.log(`✅ [7-Day Reminder] Sent to ${customerName} (${customerEmail}) for ${planTitle}`);
            } catch (err) {
                console.error(`❌ Error sending 7-day reminder for subscription ${sub.id}:`, err);
                summary.errors.push({ id: sub.id, step: '7d_reminder', error: err.message });
            }
        }

        // ──────────────────────────────────────────────────────────────
        // STEP 2: Check 1-Day Expiry (subscription_end within next 24 hours and > 0)
        // ──────────────────────────────────────────────────────────────
        const res1d = await pool.query(`
            SELECT s.*, u.name as user_name, u.email as user_email, u.phone as user_phone
            FROM subscriptions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'active'
              AND (s.reminder_1d_sent IS NULL OR s.reminder_1d_sent = false)
              AND s.subscription_end IS NOT NULL
              AND s.subscription_end <= NOW() + INTERVAL '1 day'
              AND s.subscription_end > NOW()
        `);

        console.log(`[Subscription Cron] Found ${res1d.rows.length} subscription(s) expiring tomorrow (1 day).`);

        for (const sub of res1d.rows) {
            try {
                const customerName = sub.customer_name || sub.user_name || "Valued Member";
                const customerEmail = sub.customer_email || sub.user_email || "";
                const duration = sub.duration_months || 1;
                const planTitle = sub.plan_name || `${duration}-Month Fitness Subscription`;
                const expiryDateStr = formatExpiryDate(sub.subscription_end);

                // 1. Send Customer In-App Notification
                if (sub.user_id) {
                    await notificationService.createNotification(
                        sub.user_id,
                        'subscription_expiring_1d',
                        '🚨 Urgent: Subscription Ends Tomorrow!',
                        `Your ${planTitle} ends tomorrow (${expiryDateStr}). Please renew your plan now to keep your workout schedule active!`,
                        '/billing',
                        'high',
                        {
                            subscription_id: sub.id,
                            plan_name: planTitle,
                            duration_months: duration,
                            subscription_end: sub.subscription_end,
                            customer_email: customerEmail,
                            notification_type: '1_day_reminder'
                        }
                    );
                }

                // 2. Send Customer Urgent Email
                if (customerEmail) {
                    await emailService.sendCustomerExpiryEmail({
                        customerEmail,
                        customerName,
                        planName: planTitle,
                        expiryDate: expiryDateStr,
                        daysLeft: 1,
                        type: '1_day_reminder'
                    });
                }

                // 3. Send Admin Final Alert & Email
                await notificationService.notifySuperAdmins(
                    'subscription_expiring_1d',
                    `🚨 Final Reminder: ${customerName}`,
                    `Customer ${customerName}'s subscription ends tomorrow on ${expiryDateStr}. Plan: ${duration} Month.`,
                    `/subscriptions`,
                    'high',
                    {
                        subscription_id: sub.id,
                        customer_name: customerName,
                        customer_email: customerEmail,
                        plan_name: planTitle,
                        subscription_end: sub.subscription_end
                    }
                );

                await emailService.notifyAllAdminsByEmail({
                    customerName,
                    customerEmail,
                    customerPhone: sub.user_phone || sub.customer_phone || '',
                    planName: planTitle,
                    expiryDate: expiryDateStr,
                    daysLeft: 1,
                    type: '1_day_reminder'
                });

                // 4. Mark 1-day reminder as sent (prevents duplicate notification)
                await pool.query(
                    `UPDATE subscriptions 
                     SET reminder_1d_sent = true, updated_at = NOW() 
                     WHERE id = $1`,
                    [sub.id]
                );

                summary.reminders1dSent++;
                console.log(`✅ [1-Day Reminder] Sent to ${customerName} (${customerEmail}) for ${planTitle}`);
            } catch (err) {
                console.error(`❌ Error sending 1-day reminder for subscription ${sub.id}:`, err);
                summary.errors.push({ id: sub.id, step: '1d_reminder', error: err.message });
            }
        }

        // ──────────────────────────────────────────────────────────────
        // STEP 3: Check Expired Subscriptions (subscription_end <= NOW())
        // ──────────────────────────────────────────────────────────────
        const res0d = await pool.query(`
            SELECT s.*, u.name as user_name, u.email as user_email, u.phone as user_phone
            FROM subscriptions s
            LEFT JOIN users u ON s.user_id = u.id
            WHERE s.status = 'active'
              AND s.subscription_end IS NOT NULL
              AND s.subscription_end <= NOW()
        `);

        console.log(`[Subscription Cron] Found ${res0d.rows.length} expired subscription(s) to process.`);

        for (const sub of res0d.rows) {
            try {
                const customerName = sub.customer_name || sub.user_name || "Valued Member";
                const customerEmail = sub.customer_email || sub.user_email || "";
                const duration = sub.duration_months || 1;
                const planTitle = sub.plan_name || `${duration}-Month Fitness Subscription`;
                const expiryDateStr = formatExpiryDate(sub.subscription_end);

                // 1. Update subscription status in database
                await pool.query(
                    `UPDATE subscriptions 
                     SET status = 'expired', reminder_0d_sent = true, updated_at = NOW() 
                     WHERE id = $1`,
                    [sub.id]
                );

                // 2. Update user profile status
                if (sub.user_id) {
                    await pool.query(
                        `UPDATE users 
                         SET subscription_status = 'expired' 
                         WHERE id = $1`,
                        [sub.user_id]
                    );

                    // 3. Send Customer Expiry In-App Notification
                    await notificationService.createNotification(
                        sub.user_id,
                        'subscription_expired',
                        '❌ Subscription Expired',
                        `Your ${planTitle} has expired on ${expiryDateStr}. Please renew your plan to restore full access to your sessions.`,
                        '/billing',
                        'high',
                        {
                            subscription_id: sub.id,
                            plan_name: planTitle,
                            duration_months: duration,
                            subscription_end: sub.subscription_end,
                            customer_email: customerEmail,
                            notification_type: 'expiry_notification'
                        }
                    );
                }

                // 4. Send Customer Expiry Email
                if (customerEmail) {
                    await emailService.sendCustomerExpiryEmail({
                        customerEmail,
                        customerName,
                        planName: planTitle,
                        expiryDate: expiryDateStr,
                        daysLeft: 0,
                        type: 'expired'
                    });
                }

                // 5. Send Admin Expiry In-App Alert & Email
                await notificationService.notifySuperAdmins(
                    'subscription_expired',
                    `❌ Subscription Expired: ${customerName}`,
                    `Customer ${customerName}'s subscription has expired on ${expiryDateStr}. Plan: ${duration} Month.`,
                    `/subscriptions`,
                    'high',
                    {
                        subscription_id: sub.id,
                        customer_name: customerName,
                        customer_email: customerEmail,
                        plan_name: planTitle,
                        subscription_end: sub.subscription_end
                    }
                );

                await emailService.notifyAllAdminsByEmail({
                    customerName,
                    customerEmail,
                    customerPhone: sub.user_phone || sub.customer_phone || '',
                    planName: planTitle,
                    expiryDate: expiryDateStr,
                    daysLeft: 0,
                    type: 'expired'
                });

                summary.expiredProcessed++;
                console.log(`❌ [Expired Processed] ${customerName} (${customerEmail}) subscription marked expired.`);
            } catch (err) {
                console.error(`❌ Error processing expired subscription ${sub.id}:`, err);
                summary.errors.push({ id: sub.id, step: '0d_expired', error: err.message });
            }
        }

        console.log(`🏁 [Subscription Cron] Completed: 7d=${summary.reminders7dSent}, 1d=${summary.reminders1dSent}, Expired=${summary.expiredProcessed}, Errors=${summary.errors.length}`);
        return summary;
    } catch (error) {
        console.error('Fatal Subscription Cron Error:', error);
        summary.errors.push({ fatal: true, error: error.message });
        return summary;
    }
}

// ──────────────────────────────────────────────────────────────
// CRON SCHEDULE: Runs Every Day at 08:00 AM ('0 8 * * *')
// ──────────────────────────────────────────────────────────────
cron.schedule('0 8 * * *', async () => {
    console.log('⏰ [08:00 AM Cron Trigger] Starting scheduled daily subscription expiry check...');
    await runDailySubscriptionCheck();
});

console.log('⏰ [Subscription Scheduler] Daily cron job initialized (Scheduled: 08:00 AM Daily)');

module.exports = {
    runDailySubscriptionCheck,
    formatExpiryDate
};
