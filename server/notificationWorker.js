// ──────────────────────────────────────────────────────────────
// NOTIFICATION WORKER - Cron job to process queue
// ──────────────────────────────────────────────────────────────

const { getPendingNotifications, markAsQueued, markAsSent } = require("./notificationQueue");

async function processNotificationQueue() {
    try {
        const pending = await getPendingNotifications();
        
        if (pending.length === 0) return;

        const ids = pending.map(n => n.id);
        
        // Mark as queued
        await markAsQueued(ids);
        
        // Process each notification
        for (const notification of pending) {
            // Here you would send to notification service (email, push, etc.)
            console.log(`📬 Sending notification: ${notification.title} to user ${notification.user_id}`);
        }
        
        // Mark as sent
        await markAsSent(ids);
        
        console.log(`✅ Processed ${pending.length} notifications`);
    } catch (error) {
        console.error("❌ Notification worker error:", error);
    }
}

// Schedule worker every 30 seconds
function startNotificationWorker() {
    console.log("🚀 Starting notification worker...");
    
    // Run immediately on start
    processNotificationQueue();
    
    // Run every 30 seconds
    setInterval(processNotificationQueue, 30000);
}

module.exports = {
    startNotificationWorker,
    processNotificationQueue,
};