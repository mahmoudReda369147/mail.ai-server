const { google } = require('googleapis');
const prisma = require('../config/database');

/**
 * Get authenticated Gmail instance for a user
 * @param {string} userId - User ID from database
 * @returns {Promise<Object>} - Gmail API instance and OAuth client
 */
async function getGmailInstance(userId) {
  const user = await prisma.user.findUnique({
    where: { id: userId }
  });

  if (!user || !user.accessToken) {
    throw new Error('User not authenticated with Google');
  }

  const oauth2Client = new google.auth.OAuth2(
    process.env.CLIENT_ID,
    process.env.CLIENT_SECRET,
    process.env.REDIRECT_URI
  );

  oauth2Client.setCredentials({
    access_token: user.accessToken,
    refresh_token: user.refreshToken,
    expiry_date: user.tokenExpiry ? new Date(user.tokenExpiry).getTime() : null
  });

  return {
    gmail: google.gmail({ version: 'v1', auth: oauth2Client }),
    oauth2Client
  };
}

/**
 * Setup Gmail push notifications (watch) for a user
 * @param {string} userId - User ID from database
 * @param {string} topicName - Google Cloud Pub/Sub topic name (e.g., "projects/your-project-id/topics/gmail-notifications")
 * @returns {Promise<Object>} - Watch response with historyId and expiration
 */
async function setupGmailWatch(userId, topicName) {
  const { gmail } = await getGmailInstance(userId);

  try {
    // Set up watch on user's mailbox
    const watchResponse = await gmail.users.watch({
      userId: 'me',
      requestBody: {
        topicName: topicName,
        labelIds: ['INBOX'], // Watch only INBOX, you can modify this
        labelFilterAction: 'include'
      }
    });

    console.log('Gmail watch setup successfully:', {
      userId,
      historyId: watchResponse.data.historyId,
      expiration: watchResponse.data.expiration
    });

    // Store the historyId in database for the user
    await prisma.user.update({
      where: { id: userId },
      data: {
        gmailHistoryId: String(watchResponse.data.historyId)
      }
    });

    return watchResponse.data;
  } catch (error) {
    console.error('Error setting up Gmail watch:', error);
    throw error;
  }
}

/**
 * Stop Gmail push notifications for a user
 * @param {string} userId - User ID from database
 * @returns {Promise<void>}
 */
async function stopGmailWatch(userId) {
  const { gmail } = await getGmailInstance(userId);

  try {
    await gmail.users.stop({
      userId: 'me'
    });
    console.log('Gmail watch stopped for user:', userId);
  } catch (error) {
    console.error('Error stopping Gmail watch:', error);
    throw error;
  }
}

/**
 * Get message details from Gmail
 * @param {string} userId - User ID from database
 * @param {string} messageId - Gmail message ID
 * @returns {Promise<Object>} - Message details
 */
async function getMessageDetails(userId, messageId) {
  const { gmail } = await getGmailInstance(userId);

  try {
    const message = await gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full'
    });

    return message.data;
  } catch (error) {
    console.error('Error getting message details:', error);
    throw error;
  }
}

/**
 * Get new messages since last history ID
 * @param {string} userId - User ID from database
 * @param {string} startHistoryId - Start history ID to get changes from
 * @returns {Promise<Array>} - Array of new messages
 */
async function getNewMessages(userId, startHistoryId) {
  const { gmail } = await getGmailInstance(userId);

  try {
    const historyResponse = await gmail.users.history.list({
      userId: 'me',
      startHistoryId: startHistoryId,
      historyTypes: ['messageAdded'],
      labelId: 'INBOX'
    });

    if (!historyResponse.data.history) {
      return [];
    }

    const messages = [];
    for (const history of historyResponse.data.history) {
      if (history.messagesAdded) {
        for (const added of history.messagesAdded) {
          // Fetch full message details to get headers
          try {
            const fullMessage = await gmail.users.messages.get({
              userId: 'me',
              id: added.message.id,
              format: 'metadata',
              metadataHeaders: ['From', 'Subject', 'Date']
            });
            messages.push(fullMessage.data);
          } catch (err) {
            console.error('Error fetching message details:', err);
            // Include basic message info if full fetch fails
            messages.push(added.message);
          }
        }
      }
    }

    return messages;
  } catch (error) {
    console.error('Error getting new messages:', error);
    throw error;
  }
}

/**
 * Extract sender email from message headers
 * @param {Object} message - Gmail message object
 * @returns {string|null} - Sender email address
 */
function getSenderEmail(message) {
  if (!message.payload || !message.payload.headers) {
    return null;
  }

  const fromHeader = message.payload.headers.find(
    header => header.name.toLowerCase() === 'from'
  );

  if (!fromHeader) {
    return null;
  }

  // Extract email from "Name <email@example.com>" format
  const emailMatch = fromHeader.value.match(/<(.+?)>/) || fromHeader.value.match(/([^\s<>]+@[^\s<>]+)/);
  return emailMatch ? emailMatch[1] : null;
}

/**
 * Check if message is from a specific email address
 * @param {Object} message - Gmail message object
 * @param {string} targetEmail - Email address to check against
 * @returns {boolean}
 */
function isFromSpecificEmail(message, targetEmail) {
  const senderEmail = getSenderEmail(message);
  return senderEmail && senderEmail.toLowerCase() === targetEmail.toLowerCase();
}

/**
 * Send an automated reply to an email
 * @param {string} userId - User ID from database
 * @param {string} originalMessageId - Original Gmail message ID to reply to
 * @param {string} to - Recipient email address
 * @param {string} subject - Email subject
 * @param {string} htmlBody - HTML body of the reply
 * @returns {Promise<Object>} - Sent message response
 */
async function sendAutoReply(userId, originalMessageId, to, subject, htmlBody) {
  const { gmail } = await getGmailInstance(userId);

  try {
    let threadId = null;
    let messageId = null;
    let references = null;

    // Fetch the original email to get threadId and Message-ID for proper threading
    const originalEmail = await gmail.users.messages.get({
      userId: 'me',
      id: originalMessageId,
      format: 'metadata',
      metadataHeaders: ['Message-ID', 'References'],
    });

    threadId = originalEmail.data.threadId;
    const headers = originalEmail.data.payload?.headers || [];
    messageId = headers.find(h => h.name === 'Message-ID')?.value;
    references = headers.find(h => h.name === 'References')?.value;

    // Create email message with proper threading
    const emailLines = [];
    emailLines.push(`To: ${to}`);
    emailLines.push(`Subject: ${subject}`);

    // Add threading headers to keep the reply in the same conversation
    if (messageId) {
      emailLines.push(`In-Reply-To: ${messageId}`);
      if (references) {
        emailLines.push(`References: ${references} ${messageId}`);
      } else {
        emailLines.push(`References: ${messageId}`);
      }
    }

    emailLines.push('MIME-Version: 1.0');
    emailLines.push('Content-Type: text/html; charset=UTF-8');
    emailLines.push(''); // Empty line between headers and body
    emailLines.push(htmlBody);

    const emailMessage = emailLines.join('\r\n');

    // Encode message in base64url
    const encodedMessage = Buffer.from(emailMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email with threadId for proper threading
    const sendRequest = {
      userId: 'me',
      requestBody: {
        raw: encodedMessage,
        threadId: threadId
      }
    };

    const response = await gmail.users.messages.send(sendRequest);

    console.log('Auto-reply sent successfully:', {
      messageId: response.data.id,
      threadId: response.data.threadId
    });

    return response.data;
  } catch (error) {
    console.error('Error sending auto-reply:', error);
    throw error;
  }
}

module.exports = {
  setupGmailWatch,
  stopGmailWatch,
  getMessageDetails,
  getNewMessages,
  getSenderEmail,
  isFromSpecificEmail,
  sendAutoReply
};
