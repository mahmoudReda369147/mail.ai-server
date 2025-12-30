const prisma = require('../config/database');
const { getNewMessages, getSenderEmail, isFromSpecificEmail } = require('../services/gmailPubSub');

/**
 * Handle Gmail push notification webhook from Google Cloud Pub/Sub
 * This endpoint receives notifications when new emails arrive
 */
const handleGmailWebhook = async (req, res) => {
    try {
        // Acknowledge receipt immediately (Google requires 200 response within 30 seconds)
        res.status(200).json({ message: 'Webhook received' });

        // Decode the Pub/Sub message
        const pubsubMessage = req.body.message;
        if (!pubsubMessage || !pubsubMessage.data) {
            console.log('Invalid Pub/Sub message format');
            return;
        }

        // Decode base64 data
        const decodedData = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
        const data = JSON.parse(decodedData);

        console.log('Gmail notification received:', {
            emailAddress: data.emailAddress,
            historyId: data.historyId
        });

        // Find user by email
        const user = await prisma.user.findUnique({
            where: { email: data.emailAddress }
        });

        if (!user) {
            console.log('User not found for email:', data.emailAddress);
            return;
        }

        // Get user's last history ID (you need to store this)
        const lastHistoryId = user.gmailHistoryId || data.historyId;

        // Get new messages since last history
        const newMessages = await getNewMessages(user.id, lastHistoryId);

        console.log(`Found ${newMessages.length} new messages for user ${user.email}`);

        // Filter and process messages from specific emails
        // TODO: You can configure this list in database or environment variables
        const targetEmails = process.env.WATCH_EMAILS ?
            process.env.WATCH_EMAILS.split(',').map(e => e.trim()) :
            [];

        for (const message of newMessages) {
            const senderEmail = getSenderEmail(message);
            console.log('New message from:', senderEmail);

            // Check if message is from one of the target emails
            const isTargetEmail = targetEmails.some(targetEmail =>
                isFromSpecificEmail(message, targetEmail)
            );

            if (isTargetEmail || targetEmails.length === 0) {
                // Log the message (or do whatever you need)
                console.log('📧 New message from watched email:', {
                    from: senderEmail,
                    message: message

                });

                // You can add custom logic here:
                // - Store in database
                // - Send notification
                // - Create task automatically
                // - etc.
            }
        }

        // Update user's history ID
        await prisma.user.update({
            where: { id: user.id },
            data: { gmailHistoryId: String(data.historyId) }
        });

    } catch (error) {
        console.error('Error handling Gmail webhook:', error);
        // Don't throw error - we already sent 200 response
    }
};

module.exports = {
    handleWebhook: handleGmailWebhook,
    handleGmailWebhook
};