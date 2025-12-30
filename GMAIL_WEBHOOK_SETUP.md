# Gmail Webhook Setup Guide

This guide will help you set up Gmail push notifications using Google Cloud Pub/Sub to receive real-time notifications when users get new emails from specific senders.

## Prerequisites

- Google Cloud Platform account
- Your application already has Gmail API enabled
- Users authenticate with Gmail OAuth2

## Step 1: Create a Google Cloud Pub/Sub Topic

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **Pub/Sub** → **Topics**
4. Click **CREATE TOPIC**
5. Enter a topic name, e.g., `gmail-notifications`
6. Click **CREATE**
7. Copy the full topic name (format: `projects/YOUR_PROJECT_ID/topics/gmail-notifications`)

## Step 2: Grant Gmail API Permissions to Pub/Sub

Gmail needs permission to publish to your Pub/Sub topic:

1. In the Pub/Sub topic page, click on your topic
2. Click **PERMISSIONS** tab
3. Click **ADD PRINCIPAL**
4. Add this service account: `gmail-api-push@system.gserviceaccount.com`
5. Assign role: **Pub/Sub Publisher**
6. Click **SAVE**

## Step 3: Create a Push Subscription

1. In your Pub/Sub topic, click **CREATE SUBSCRIPTION**
2. Enter subscription ID, e.g., `gmail-webhook-subscription`
3. Select **Delivery type**: **Push**
4. Enter your **Endpoint URL**: `https://yourdomain.com/api/webhooks/gmail`
   - Must be HTTPS
   - Must be publicly accessible
   - Must return 200 status within 30 seconds
5. Click **CREATE**

## Step 4: Update Environment Variables

Add these to your `.env` file:

```env
# Google Cloud Pub/Sub Topic (full topic name)
GMAIL_PUBSUB_TOPIC=projects/YOUR_PROJECT_ID/topics/gmail-notifications

# Optional: Comma-separated list of emails to watch
# If empty, all emails will be logged
WATCH_EMAILS=important@example.com,client@company.com
```

## Step 5: Update Database Schema

Run Prisma migration to add the `gmailHistoryId` field:

```bash
npx prisma migrate dev --name add_gmail_history_id
```

Or if using push:

```bash
npx prisma db push
```

## Step 6: Add Routes to Your App

Add the Gmail watch routes to your main app file:

```javascript
// In your main app.js or index.js
const gmailWatchController = require('./src/controllers/gmailWatch');
const authMiddleware = require('./src/middleware/auth'); // Your auth middleware

// Setup Gmail watch (protected route)
app.post('/api/gmail/watch/setup', authMiddleware, gmailWatchController.setupWatch);

// Stop Gmail watch (protected route)
app.post('/api/gmail/watch/stop', authMiddleware, gmailWatchController.stopWatch);

// Webhook endpoint (public - no auth needed)
app.post('/api/webhooks/gmail', require('./src/controllers/webhooks').handleGmailWebhook);
```

## Step 7: Enable Gmail API Watch for Users

After a user authenticates with Google OAuth, call the setup endpoint:

```bash
POST /api/gmail/watch/setup
Authorization: Bearer <user-token>
```

This will:
- Register Gmail push notifications for the user
- Store the initial historyId in the database
- Watch expires after 7 days (you need to renew it)

## Step 8: Test the Webhook

1. Send an email to the authenticated user's Gmail
2. Check your server logs for the webhook notification
3. You should see logs like:

```
Gmail notification received: {
  emailAddress: 'user@gmail.com',
  historyId: '123456'
}
Found 1 new messages for user user@gmail.com
New message from: sender@example.com
📧 New message from watched email: {
  from: 'sender@example.com',
  messageId: 'abc123',
  threadId: 'thread123',
  snippet: 'Email preview...'
}
```

## Important Notes

### Watch Expiration

- Gmail watch expires after **7 days**
- You need to renew it before expiration
- Set up a cron job to renew watches periodically

### Renew Watch Example

```javascript
// Run this daily via cron
const renewAllWatches = async () => {
  const users = await prisma.user.findMany({
    where: {
      accessToken: { not: null }
    }
  });

  for (const user of users) {
    try {
      await setupGmailWatch(user.id, process.env.GMAIL_PUBSUB_TOPIC);
      console.log('Renewed watch for:', user.email);
    } catch (error) {
      console.error('Failed to renew watch for:', user.email, error);
    }
  }
};
```

### Security Considerations

1. **Verify Pub/Sub messages** - In production, verify the message authenticity
2. **Rate limiting** - Add rate limiting to webhook endpoint
3. **HTTPS only** - Webhook URL must use HTTPS
4. **Error handling** - Always return 200 even on errors (after responding)

### Filtering Specific Senders

The webhook automatically filters messages based on `WATCH_EMAILS` environment variable:

```env
# Only log messages from these emails
WATCH_EMAILS=boss@company.com,client@important.com

# Leave empty to log all incoming emails
WATCH_EMAILS=
```

## Customizing the Webhook Handler

Edit [webhooks.js:71-76](src/controllers/webhooks.js#L71-L76) to add custom logic:

```javascript
if (isTargetEmail || targetEmails.length === 0) {
  // Your custom logic here:

  // 1. Save to database
  await prisma.emailNotification.create({
    data: {
      userId: user.id,
      messageId: message.id,
      from: senderEmail,
      snippet: message.snippet
    }
  });

  // 2. Send push notification
  await sendPushNotification(user.id, {
    title: `New email from ${senderEmail}`,
    body: message.snippet
  });

  // 3. Auto-create task
  await createTaskFromEmail(user.id, message);
}
```

## Troubleshooting

### Webhook not receiving notifications

1. Check Pub/Sub subscription status in Google Cloud Console
2. Verify endpoint URL is publicly accessible (test with curl)
3. Check if Gmail watch is still active (they expire after 7 days)
4. Look for errors in Google Cloud Logging

### "User not authenticated" error

- User needs to have `accessToken` and `refreshToken` in database
- Call `/api/gmail/watch/setup` after user OAuth authentication

### Message not being logged

- Check `WATCH_EMAILS` environment variable
- Verify message is going to INBOX (not spam/other labels)
- Check server logs for filtering logic

## API Endpoints

### Setup Watch
```
POST /api/gmail/watch/setup
Authorization: Bearer <token>

Response:
{
  "success": true,
  "data": {
    "historyId": "123456",
    "expiration": "1640000000000"
  },
  "message": "Gmail watch setup successfully"
}
```

### Stop Watch
```
POST /api/gmail/watch/stop
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Gmail watch stopped successfully"
}
```

### Webhook Endpoint (Called by Google)
```
POST /api/webhooks/gmail
Content-Type: application/json

{
  "message": {
    "data": "base64-encoded-data",
    "messageId": "message-id",
    "publishTime": "2024-01-01T00:00:00Z"
  }
}
```

## Resources

- [Gmail Push Notifications Guide](https://developers.google.com/gmail/api/guides/push)
- [Google Cloud Pub/Sub Documentation](https://cloud.google.com/pubsub/docs)
- [Gmail API Reference](https://developers.google.com/gmail/api/reference/rest)
