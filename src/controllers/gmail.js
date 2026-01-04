const { google } = require('googleapis');
const prisma = require('../config/database');
const agent = require('../services/agent');
const oauth2Client = require('../services/googleClint');
const { ok, created, fail } = require('../utils/response');

// Helper: decode Gmail's base64url-encoded body
function decodeBase64Url(data) {
  if (!data) return '';
  const buff = Buffer.from(data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
  return buff.toString('utf8');
}

// Helper: safely parse agent JSON responses (handles escaped JSON and code fences)
function safeParseAgentJson(raw) {
  if (raw == null) return null;
  let s = String(raw).trim();
  // Remove code fences if present
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?/i, '').replace(/```\s*$/, '').trim();
  }
  // If the payload contains extra text, try to isolate the JSON object
  const firstBrace = s.indexOf('{');
  const lastBrace = s.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1) {
    s = s.slice(firstBrace, lastBrace + 1);
  }
  // Try parsing directly
  try {
    const parsed = JSON.parse(s);
    // Sometimes models double-encode: result is a string that is itself JSON
    if (typeof parsed === 'string') {
      try {
        return JSON.parse(parsed);
      } catch {
        return { _raw: parsed };
      }
    }
    return parsed;
  } catch {
    // Try unescaping common escape sequences
    try {
      const unescaped = s
        .replace(/^\"|\"$/g, '')
        .replace(/\\"/g, '"')
        .replace(/\\n/g, '\n')
        .replace(/\\t/g, '\t')
        .replace(/\\r/g, '\r');
      const parsed2 = JSON.parse(unescaped);
      if (typeof parsed2 === 'string') {
        try { return JSON.parse(parsed2); } catch { return { _raw: parsed2 }; }
      }
      return parsed2;
    } catch {
      return null;
    }
  }
}

// Helper: recursively extract text/plain and text/html from payload
function extractBodies(payload) {
  let text = '';
  let html = '';

  const walk = (part) => {
    if (!part) return;
    const mimeType = part.mimeType || '';
    if (part.body && part.body.data && (mimeType === 'text/plain' || mimeType === 'text/html')) {
      const decoded = decodeBase64Url(part.body.data);
      if (mimeType === 'text/plain') text += decoded;
      if (mimeType === 'text/html') html += decoded;
    }

    // Some messages have no parts; the body is directly on payload
    if (!part.parts && part.body && part.body.data && !mimeType) {
      // try to treat as text
      text += decodeBase64Url(part.body.data);
    }

    if (Array.isArray(part.parts)) {
      part.parts.forEach(walk);
    }
  };

  walk(payload);
  return { text: text || null, html: html || null };
}

// Helper: collect attachment parts metadata recursively
function collectAttachmentParts(payload, list = []) {
  if (!payload) return list;
  const hasFilename = !!payload.filename;
  const hasAttachmentId = !!payload?.body?.attachmentId;
  if (hasFilename && hasAttachmentId) {
    list.push({
      filename: payload.filename,
      mimeType: payload.mimeType || null,
      size: payload.body?.size || null,
      attachmentId: payload.body.attachmentId,
      partId: payload.partId || null,
    });
  }
  if (Array.isArray(payload.parts)) {
    payload.parts.forEach((p) => collectAttachmentParts(p, list));
  }
  return list;
}

/**
 * GET /api/gmail/emails
 * Requires authMiddleware to attach req.user
 */
const getEmails = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'No Google tokens found for this user. Please login with Google first.');
    }

    // Set credentials on the shared OAuth client. Clone if concurrency becomes an issue.
    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Pagination (10 by 10) and optional query filter
    const { pageToken, q } = req.query;
    const maxResults = 10;
    
    // Build query to exclude sent emails
    let query = q || '';
    if (user.email) {
      // Exclude emails from the user (sen
      // t emails)
      const excludeFrom = `-from:${user.email}`;
      query = query ? `${query} ${excludeFrom}` : excludeFrom;
    }
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      pageToken,
      q: query,
    });

    const messages = listRes.data.messages || [];
    const nextPageToken = listRes.data.nextPageToken || null;
    const resultSizeEstimate = listRes.data.resultSizeEstimate ?? null;

    // Fetch metadata for each message in parallel, but cap concurrency to avoid rate limits
    const concurrency = 10;
    const chunks = [];
    for (let i = 0; i < messages.length; i += concurrency) {
      chunks.push(messages.slice(i, i + concurrency));
    }

    const results = [];
    for (const chunk of chunks) {
      const details = await Promise.all(
        chunk.map(async (m) => {
          try {
            const msgRes = await gmail.users.messages.get({
              userId: 'me',
              id: m.id,
              format: 'full',
            });
            const payload = msgRes.data.payload || {};
            const headers = payload.headers || [];
            const getHeader = (name) => headers.find((h) => h.name === name)?.value || null;
            const bodies = extractBodies(payload);

            // Collect and fetch attachments
            const attachmentParts = collectAttachmentParts(payload);
            const MAX_ATTACHMENT_COUNT = 10;
            const MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
            const selected = attachmentParts.slice(0, MAX_ATTACHMENT_COUNT);
            const attachments = await Promise.all(
              selected.map(async (att) => {
                try {
                  if (att.size && att.size > MAX_INLINE_SIZE) {
                    return {
                      filename: att.filename,
                      mimeType: att.mimeType,
                      size: att.size,
                      attachmentId: att.attachmentId,
                      data: null,
                      tooLarge: true,
                    };
                  }
                  const attRes = await gmail.users.messages.attachments.get({
                    userId: 'me',
                    messageId: msgRes.data.id,
                    id: att.attachmentId,
                  });
                  const data = attRes.data?.data || null; // base64url
                  return {
                    filename: att.filename,
                    mimeType: att.mimeType,
                    size: att.size,
                    attachmentId: att.attachmentId,
                    data,
                    tooLarge: false,
                  };
                } catch (e) {
                  return {
                    filename: att.filename,
                    mimeType: att.mimeType,
                    size: att.size,
                    attachmentId: att.attachmentId,
                    data: null,
                    error: e?.message || 'Failed to fetch attachment',
                  };
                }
              })
            );

            // Check if email is read (UNREAD label not present)
            const isRead = !msgRes.data.labelIds?.includes('UNREAD');

            return {
              id: msgRes.data.id,
              threadId: msgRes.data.threadId,
              snippet: msgRes.data.snippet || null,
              internalDate: msgRes.data.internalDate || null,
              isRead,
              from: getHeader('From'),
              to: getHeader('To'),
              subject: getHeader('Subject'),
              date: getHeader('Date'),
              textBody: bodies.text,
              htmlBody: bodies.html,
              attachments,
              labels: msgRes.data.labelIds || [],
            };
          } catch (e) {
            return { id: m.id, error: e?.message || 'Failed to fetch message' };
          }
        })
      );
      results.push(...details);
    }

    return ok(res, results, 'Emails fetched successfully', {
      count: results.length,
      pageSize: maxResults,
      nextPageToken,
      hasMore: Boolean(nextPageToken),
      resultSizeEstimate,
      q: q || null,
    });
  } catch (error) {
    console.error('Error fetching emails:', error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired or invalid. Please re-authenticate.');
    }
    return fail(res, 500, 'Failed to fetch emails'+error.message);
  }
};

// GET /api/gmail/emails/:id
const getEmailById = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'No Google tokens found for this user. Please login with Google first.');
    }

    const { id } = req.params;
    if (!id) return fail(res, 400, 'Message id is required');

    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });

    const payload = msgRes.data.payload || {};
    const headers = payload.headers || [];
    const getHeader = (name) => headers.find((h) => h.name === name)?.value || null;
    const bodies = extractBodies(payload);

    const attachmentParts = collectAttachmentParts(payload);
    const MAX_ATTACHMENT_COUNT = 10;
    const MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
    const selected = attachmentParts.slice(0, MAX_ATTACHMENT_COUNT);
    const attachments = await Promise.all(
      selected.map(async (att) => {
        try {
          if (att.size && att.size > MAX_INLINE_SIZE) {
            return {
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              attachmentId: att.attachmentId,
              data: null,
              tooLarge: true,
            };
          }
          const attRes = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: msgRes.data.id,
            id: att.attachmentId,
          });
          const data = attRes.data?.data || null; // base64url
          return {
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            attachmentId: att.attachmentId,
            data,
            tooLarge: false,
          };
        } catch (e) {
          return {
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            attachmentId: att.attachmentId,
            data: null,
            error: e?.message || 'Failed to fetch attachment',
          };
        }
      })
    );

    const email = {
      id: msgRes.data.id,
      threadId: msgRes.data.threadId,
      snippet: msgRes.data.snippet || null,
      internalDate: msgRes.data.internalDate || null,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      textBody: bodies.text,
      htmlBody: bodies.html,
      attachments,
    };

    // Fetch last calendar task for this gmail
    const lastCalendarTask = await prisma.calendarTask.findFirst({
      where: { gmailId: id },
      orderBy: { createdAt: 'desc' }
    });

    // Fetch last AI summary for this gmail
    const lastAiSummary = await prisma.aiSummarys.findFirst({
      where: { gmailId: id },
      orderBy: { createdAt: 'desc' }
    });

    // Mark email as read after successfully fetching it
    try {
      await gmail.users.messages.modify({
        userId: 'me',
        id: id,
        requestBody: {
          removeLabelIds: ['UNREAD']
        }
      });
    } catch (modifyError) {
      console.warn('Failed to mark email as read:', modifyError.message);
      // Continue with response even if marking as read fails
    }

    return ok(res, {
      ...email,
      calendarTask: lastCalendarTask || null,
      aiSummary: lastAiSummary || null
    }, 'Email fetched successfully');
  } catch (error) {
    console.error('Error fetching email by id:', error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired or invalid. Please re-authenticate.');
    }
    return fail(res, 500, 'Failed to fetch email' + (error?.message || ''));
  }
};
const getreplayByGmailId = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'No Google tokens found for this user. Please login with Google first.');
    }

    const { id } = req.params;
    if (!id) return fail(res, 400, 'Message id is required');

    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const msgRes = await gmail.users.messages.get({
      userId: 'me',
      id,
      format: 'full',
    });

    const payload = msgRes.data.payload || {};
    const headers = payload.headers || [];
    const getHeader = (name) => headers.find((h) => h.name === name)?.value || null;
    const bodies = extractBodies(payload);

    const attachmentParts = collectAttachmentParts(payload);
    const MAX_ATTACHMENT_COUNT = 10;
    const MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
    const selected = attachmentParts.slice(0, MAX_ATTACHMENT_COUNT);
    const attachments = await Promise.all(
      selected.map(async (att) => {
        try {
          if (att.size && att.size > MAX_INLINE_SIZE) {
            return {
              filename: att.filename,
              mimeType: att.mimeType,
              size: att.size,
              attachmentId: att.attachmentId,
              data: null,
              tooLarge: true,
            };
          }
          const attRes = await gmail.users.messages.attachments.get({
            userId: 'me',
            messageId: msgRes.data.id,
            id: att.attachmentId,
          });
          const data = attRes.data?.data || null; // base64url
          return {
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            attachmentId: att.attachmentId,
            data,
            tooLarge: false,
          };
        } catch (e) {
          return {
            filename: att.filename,
            mimeType: att.mimeType,
            size: att.size,
            attachmentId: att.attachmentId,
            data: null,
            error: e?.message || 'Failed to fetch attachment',
          };
        }
      })
    );

    const email = {
      id: msgRes.data.id,
      threadId: msgRes.data.threadId,
      snippet: msgRes.data.snippet || null,
      internalDate: msgRes.data.internalDate || null,
      from: getHeader('From'),
      to: getHeader('To'),
      subject: getHeader('Subject'),
      date: getHeader('Date'),
      textBody: bodies.text,
      htmlBody: bodies.html,
      attachments,
    };
    const agentResponse = await agent(process.env.SYSTEM_PROMPET_FOR_GENERATE_MESSAGE,[],`the email is : ${email.textBody || email.htmlBody || ''}. and the user prompet is : ${req.body.prompet}`);
    console.log("agentResponse", agentResponse);
    return ok(res, {reply:JSON.parse(agentResponse) }, 'Email fetched successfully');
  } catch (error) {
    console.error('Error fetching email by id:', error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired or invalid. Please re-authenticate.');
    }
    return fail(res, 500, 'Failed to fetch email' + (error?.message || ''));
  }
};

const sendEmail = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'No Google tokens found for this user. Please login with Google first.');
    }

    const { to, subject, gmailId, body, cc, bcc } = req.body;

    if (!to || !subject || !body) {
      return fail(res, 400, 'Required fields: to, subject, body');
    }

    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    let threadId = null;
    let messageId = null;
    let references = null;

    // If gmailId exists, fetch the original email to get threadId and Message-ID
    if (gmailId) {
      try {
        const originalEmail = await gmail.users.messages.get({
          userId: 'me',
          id: gmailId,
          format: 'metadata',
          metadataHeaders: ['Message-ID', 'References'],
        });

        threadId = originalEmail.data.threadId;
        const headers = originalEmail.data.payload?.headers || [];
        messageId = headers.find(h => h.name === 'Message-ID')?.value;
        references = headers.find(h => h.name === 'References')?.value;
      } catch (error) {
        console.error('Error fetching original email:', error);
        // Continue without threading if original email can't be fetched
      }
    }

    // Create email message
    const emailLines = [];
    emailLines.push(`To: ${to}`);
    if (cc) emailLines.push(`Cc: ${cc}`);
    if (bcc) emailLines.push(`Bcc: ${bcc}`);
    emailLines.push(`Subject: ${subject}`);

    // Add threading headers if replying to an existing email
    if (messageId) {
      emailLines.push(`In-Reply-To: ${messageId}`);
      if (references) {
        emailLines.push(`References: ${references} ${messageId}`);
      } else {
        emailLines.push(`References: ${messageId}`);
      }
    }

    emailLines.push('MIME-Version: 1.0');
    emailLines.push(`Content-Type: text/html; charset=UTF-8`);
    emailLines.push(''); // Empty line between headers and body
    emailLines.push(body);

    const emailMessage = emailLines.join('\r\n');

    // Encode message in base64url
    const encodedMessage = Buffer.from(emailMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email with threadId if available
    const sendRequest = {
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    };

    if (threadId) {
      sendRequest.requestBody.threadId = threadId;
    }

    const response = await gmail.users.messages.send(sendRequest);

    // Save sent email to database
    // try {
    //   await prisma.sendedEmail.create({
    //     data: {
    //       emailId: response.data.id,
    //       theridedId: response.data.threadId,
    //       userId: user.id
    //     }
    //   });
    // } catch (dbError) {
    //   console.error('Error saving sent email to database:', dbError);
    //   // Continue with response even if DB save fails
    // }

    return ok(res, {
      id: response.data.id,
      threadId: response.data.threadId,
      message: gmailId ? 'Reply sent successfully in same thread' : 'Email sent successfully'
    }, gmailId ? 'Reply sent successfully in same thread' : 'Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired or invalid. Please re-authenticate.');
    }
    return fail(res, 500, 'Failed to send email: ' + (error?.message || ''));
  }
};

const deleteEmail = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'No Google tokens found for this user. Please login with Google first.');
    }
    
    const { id } = req.params;
    if (!id) return fail(res, 400, 'Message id is required');

    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Delete the email (moves to trash)
    await gmail.users.messages.trash({
      userId: 'me',
      id: id
    });

    return ok(res, { id, message: 'Email moved to trash successfully' }, 'Email moved to trash successfully');
  } catch (error) {
    console.error('Error deleting email:', error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired or invalid. Please re-authenticate.');
    }
    if (error?.code === 404) {
      return fail(res, 404, 'Email not found');
    }
    return fail(res, 500, 'Failed to delete email: ' + (error?.message || ''));
  }
};

const getThreads = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'No Google tokens found for this user. Please login with Google first.');
    }

    // Set credentials on the shared OAuth client
    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Pagination and optional query filter
    const { pageToken, q } = req.query;
    const maxResults = 10;
    
    const listRes = await gmail.users.threads.list({
      userId: 'me',
      maxResults,
      pageToken,
      q,
    });

    const threads = listRes.data.threads || [];
    const nextPageToken = listRes.data.nextPageToken || null;
    const resultSizeEstimate = listRes.data.resultSizeEstimate ?? null;

    // Fetch details for each thread in parallel
    const concurrency = 10;
    const chunks = [];
    for (let i = 0; i < threads.length; i += concurrency) {
      chunks.push(threads.slice(i, i + concurrency));
    }

    const results = [];
    for (const chunk of chunks) {
      const details = await Promise.all(
        chunk.map(async (thread) => {
          try {
            const threadRes = await gmail.users.threads.get({
              userId: 'me',
              id: thread.id,
              format: 'metadata',
              metadataHeaders: ['Subject', 'From', 'To', 'Date'],
            });

            const messages = threadRes.data.messages || [];
            const firstMessage = messages[0];
            const lastMessage = messages[messages.length - 1];
            
            const getHeader = (headers, name) => headers.find((h) => h.name === name)?.value || null;
            const firstHeaders = firstMessage?.payload?.headers || [];
            const lastHeaders = lastMessage?.payload?.headers || [];

            return {
              id: threadRes.data.id,
              historyId: threadRes.data.historyId,
              snippet: threadRes.data.snippet || null,
              messageCount: messages.length,
              subject: getHeader(firstHeaders, 'Subject'),
              from: getHeader(firstHeaders, 'From'),
              to: getHeader(firstHeaders, 'To'),
              firstDate: getHeader(firstHeaders, 'Date'),
              lastDate: getHeader(lastHeaders, 'Date'),
              messages: messages.map(msg => ({
                id: msg.id,
                threadId: msg.threadId,
                snippet: msg.snippet || null,
                internalDate: msg.internalDate || null,
                from: getHeader(msg?.payload?.headers || [], 'From'),
                to: getHeader(msg?.payload?.headers || [], 'To'),
                subject: getHeader(msg?.payload?.headers || [], 'Subject'),
                date: getHeader(msg?.payload?.headers || [], 'Date'),
              }))
            };
          } catch (e) {
            return { id: thread.id, error: e?.message || 'Failed to fetch thread' };
          }
        })
      );
      results.push(...details);
    }

    return ok(res, results, 'Threads fetched successfully', {
      count: results.length,
      pageSize: maxResults,
      nextPageToken,
      hasMore: Boolean(nextPageToken),
      resultSizeEstimate,
      q: q || null,
    });
  } catch (error) {
    console.error('Error fetching threads:', error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired or invalid. Please re-authenticate.');
    }
    return fail(res, 500, 'Failed to fetch threads: ' + error.message);
  }
};

/**
 * GET /api/gmail/sended
 * Get all sent emails from Google Gmail API (not from database)
 */
const getSendedEmails = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'No Google tokens found for this user. Please login with Google first.');
    }

    // Set credentials on the shared OAuth client
    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Pagination and optional query filter
    const { pageToken, q } = req.query;
    const maxResults = 10;
    
    // Build query to get only sent emails
    let query = q || '';
    if (user.email) {
      // Only show emails sent by the user
      const fromUser = `from:${user.email}`;
      query = query ? `${query} ${fromUser}` : fromUser;
    }
    
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      pageToken,
      q: query,
    });

    const messages = listRes.data.messages || [];
    const nextPageToken = listRes.data.nextPageToken;
    const resultSizeEstimate = listRes.data.resultSizeEstimate;

    if (messages.length === 0) {
      return ok(res, [], 'No sent emails found', {
        count: 0,
        pageSize: maxResults,
        nextPageToken,
        hasMore: Boolean(nextPageToken),
        resultSizeEstimate,
        q: query || null,
      });
    }

    // Fetch full message details for each message
    const concurrency = 5; // Process 5 messages at a time
    const chunks = [];
    for (let i = 0; i < messages.length; i += concurrency) {
      chunks.push(messages.slice(i, i + concurrency));
    }

    const results = [];
    for (const chunk of chunks) {
      const details = await Promise.all(
        chunk.map(async (message) => {
          try {
            const messageRes = await gmail.users.messages.get({
              userId: 'me',
              id: message.id,
              format: 'full',
            });

            const payload = messageRes.data.payload;
            const headers = payload?.headers || [];
            
            const getHeader = (headers, name) => headers.find((h) => h.name === name)?.value || null;

            // Helper function to extract body content from message parts
            const extractBodyContent = (payload) => {
              let textBody = '';
              let htmlBody = '';
              
              const processPart = (part) => {
                if (part.mimeType === 'text/plain' && part.body.data) {
                  textBody = decodeBase64Url(part.body.data);
                } else if (part.mimeType === 'text/html' && part.body.data) {
                  htmlBody = decodeBase64Url(part.body.data);
                } else if (part.parts) {
                  part.parts.forEach(processPart);
                }
              };
              
              if (payload.parts) {
                payload.parts.forEach(processPart);
              } else if (payload.body && payload.body.data) {
                if (payload.mimeType === 'text/plain') {
                  textBody = decodeBase64Url(payload.body.data);
                } else if (payload.mimeType === 'text/html') {
                  htmlBody = decodeBase64Url(payload.body.data);
                }
              }
              
              return { textBody, htmlBody };
            };

            const { textBody, htmlBody } = extractBodyContent(payload);

            return {
              id: messageRes.data.id,
              threadId: messageRes.data.threadId,
              snippet: messageRes.data.snippet || null,
              internalDate: messageRes.data.internalDate,
              from: getHeader(headers, 'From'),
              to: getHeader(headers, 'To'),
              subject: getHeader(headers, 'Subject'),
              date: getHeader(headers, 'Date'),
              textBody: textBody,
              htmlBody: htmlBody,
              attachments: []
            };
          } catch (e) {
            return { id: message.id, error: e?.message || 'Failed to fetch message' };
          }
        })
      );
      results.push(...details);
    }

    return ok(res, results, 'Sent emails fetched successfully', {
      count: results.length,
      pageSize: maxResults,
      nextPageToken,
      hasMore: Boolean(nextPageToken),
      resultSizeEstimate,
      q: query || null,
    });
  } catch (error) {
    console.error('Error fetching sent emails:', error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired or invalid. Please re-authenticate.');
    }
    return fail(res, 500, 'Failed to fetch sent emails: ' + error.message);
  }
};

const saveGmailSummary = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { summary, priority, gmailId } = req.body;

    // Validate required fields (require summary, priority; userId defaults to auth user; gmailId optional by schema)
    if (!summary || priority === undefined || priority === null) {
      return fail(res, 400, 'summary and priority are required');
    }

  

    const parsedPriority = parseInt(priority, 10);
    if (Number.isNaN(parsedPriority)) {
      return fail(res, 400, 'priority must be an integer');
    }

    const record = await prisma.aiSummarys.create({
      data: {
        summary,
        priority: parsedPriority,
        userId: user.id,
        gmailId: gmailId ?? null,
      },
    });

    return created(res, record, 'AI summary saved successfully');
  } catch (error) {
    console.error('Error saving AI summary:', error);
    return fail(res, 500, 'Failed to save AI summary: ' + (error?.message || ''));
  }
};

const getUnreadEmailCount = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return fail(res, 401, 'Unauthorized');

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'Please login with Google first.');
    }

    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // ✅ Get accurate unread count from Inbox label
    const labelRes = await gmail.users.labels.get({
      userId: 'me',
      id: 'UNREAD'
    });

    const unreadCount = labelRes.data.messagesUnread || 0;

    return ok(res, {
      unreadCount,
      hasUnread: unreadCount > 0,
    }, 'Unread email count fetched successfully');

  } catch (error) {
    console.error(error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired, please re-authenticate.');
    }
    return fail(res, 500, error.message);
  }
};


const archiveEmail = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return fail(res, 401, 'Unauthorized');

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'Please login with Google first.');
    }

    const { id } = req.params;
    if (!id) return fail(res, 400, 'Message id is required');

    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Archive email by removing INBOX label
    await gmail.users.messages.modify({
      userId: 'me',
      id: id,
      requestBody: {
        removeLabelIds: ['INBOX']
      }
    });

    return ok(res, { id, archived: true }, 'Email archived successfully');
  } catch (error) {
    console.error(error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired, please re-authenticate.');
    }
    if (error?.code === 404) {
      return fail(res, 404, 'Email not found');
    }
    return fail(res, 500, error.message);
  }
};



const getArchivedEmails = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return fail(res, 401, 'Unauthorized');

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'Please login with Google first.');
    }

    // Set credentials on the shared OAuth client
    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Pagination and optional query filter
    const { pageToken, q } = req.query;
    const maxResults = 10;
    
    // Build query to get archived emails (no INBOX label) and exclude sent emails
    let query = '-label:INBOX';
    if (user.email) {
      // Exclude emails from the user (sent emails)
      const excludeFrom = `-from:${user.email}`;
      query = `${query} ${excludeFrom}`;
    }
    
    // Add any additional query parameters
    if (q) {
      query = `${query} ${q}`;
    }

    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      pageToken,
      q: query,
    });

    const messages = listRes.data.messages || [];
    const nextPageToken = listRes.data.nextPageToken || null;
    const resultSizeEstimate = listRes.data.resultSizeEstimate ?? null;

    if (messages.length === 0) {
      return ok(res, [], 'No archived emails found', {
        count: 0,
        pageSize: maxResults,
        nextPageToken,
        hasMore: Boolean(nextPageToken),
        resultSizeEstimate,
        q: q || null,
      });
    }

    // Fetch metadata for each message in parallel, but cap concurrency to avoid rate limits
    const concurrency = 10;
    const chunks = [];
    for (let i = 0; i < messages.length; i += concurrency) {
      chunks.push(messages.slice(i, i + concurrency));
    }

    const results = [];
    for (const chunk of chunks) {
      const details = await Promise.all(
        chunk.map(async (m) => {
          try {
            const msgRes = await gmail.users.messages.get({
              userId: 'me',
              id: m.id,
              format: 'full',
            });
            const payload = msgRes.data.payload || {};
            const headers = payload.headers || [];
            const getHeader = (name) => headers.find((h) => h.name === name)?.value || null;
            const bodies = extractBodies(payload);

            // Collect and fetch attachments
            const attachmentParts = collectAttachmentParts(payload);
            const MAX_ATTACHMENT_COUNT = 10;
            const MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
            const selected = attachmentParts.slice(0, MAX_ATTACHMENT_COUNT);
            const attachments = await Promise.all(
              selected.map(async (att) => {
                try {
                  if (att.size && att.size > MAX_INLINE_SIZE) {
                    return {
                      filename: att.filename,
                      mimeType: att.mimeType,
                      size: att.size,
                      attachmentId: att.attachmentId,
                      data: null,
                      tooLarge: true,
                    };
                  }
                  const attRes = await gmail.users.messages.attachments.get({
                    userId: 'me',
                    messageId: msgRes.data.id,
                    id: att.attachmentId,
                  });
                  const data = attRes.data?.data || null; // base64url
                  return {
                    filename: att.filename,
                    mimeType: att.mimeType,
                    size: att.size,
                    attachmentId: att.attachmentId,
                    data,
                    tooLarge: false,
                  };
                } catch (e) {
                  return {
                    filename: att.filename,
                    mimeType: att.mimeType,
                    size: att.size,
                    attachmentId: att.attachmentId,
                    data: null,
                    error: e?.message || 'Failed to fetch attachment',
                  };
                }
              })
            );

            // Check if email is read (UNREAD label not present)
            const isRead = !msgRes.data.labelIds?.includes('UNREAD');

            return {
              id: msgRes.data.id,
              threadId: msgRes.data.threadId,
              snippet: msgRes.data.snippet || null,
              internalDate: msgRes.data.internalDate || null,
              isRead,
              from: getHeader('From'),
              to: getHeader('To'),
              subject: getHeader('Subject'),
              date: getHeader('Date'),
              textBody: bodies.text,
              htmlBody: bodies.html,
              attachments,
              labels: msgRes.data.labelIds || [],
              isArchived: true, // Explicitly mark as archived
            };
          } catch (e) {
            return { id: m.id, error: e?.message || 'Failed to fetch message' };
          }
        })
      );
      results.push(...details);
    }

    return ok(res, results, 'Archived emails fetched successfully', {
      count: results.length,
      pageSize: maxResults,
      nextPageToken,
      hasMore: Boolean(nextPageToken),
      resultSizeEstimate,
      q: q || null,
    });
  } catch (error) {
    console.error(error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired, please re-authenticate.');
    }
    return fail(res, 500, error.message);
  }
};

const getThreadById = async (req, res) => {
  try {
    const user = req.user;
    if (!user) return fail(res, 401, 'Unauthorized');

    if (!user.accessToken && !user.refreshToken) {
      return fail(res, 400, 'Please login with Google first.');
    }

    const { id } = req.params;
    if (!id) return fail(res, 400, 'Thread id is required');

    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    const threadRes = await gmail.users.threads.get({
      userId: 'me',
      id: id,
      format: 'full',
    });

    const messages = threadRes.data.messages || [];
    
    // Process each message in the thread
    const processedMessages = await Promise.all(
      messages.map(async (msg) => {
        try {
          const payload = msg.payload || {};
          const headers = payload.headers || [];
          const getHeader = (name) => headers.find((h) => h.name === name)?.value || null;
          const bodies = extractBodies(payload);

          // Collect and fetch attachments
          const attachmentParts = collectAttachmentParts(payload);
          const MAX_ATTACHMENT_COUNT = 10;
          const MAX_INLINE_SIZE = 5 * 1024 * 1024; // 5MB
          const selected = attachmentParts.slice(0, MAX_ATTACHMENT_COUNT);
          const attachments = await Promise.all(
            selected.map(async (att) => {
              try {
                if (att.size && att.size > MAX_INLINE_SIZE) {
                  return {
                    filename: att.filename,
                    mimeType: att.mimeType,
                    size: att.size,
                    attachmentId: att.attachmentId,
                    data: null,
                    tooLarge: true,
                  };
                }
                const attRes = await gmail.users.messages.attachments.get({
                  userId: 'me',
                  messageId: msg.id,
                  id: att.attachmentId,
                });
                const data = attRes.data?.data || null; // base64url
                return {
                  filename: att.filename,
                  mimeType: att.mimeType,
                  size: att.size,
                  attachmentId: att.attachmentId,
                  data,
                  tooLarge: false,
                };
              } catch (e) {
                return {
                  filename: att.filename,
                  mimeType: att.mimeType,
                  size: att.size,
                  attachmentId: att.attachmentId,
                  data: null,
                  error: e?.message || 'Failed to fetch attachment',
                };
              }
            })
          );

          // Check if email is read (UNREAD label not present)
          const isRead = !msg.labelIds?.includes('UNREAD');

          return {
            id: msg.id,
            threadId: msg.threadId,
            snippet: msg.snippet || null,
            internalDate: msg.internalDate || null,
            isRead,
            labels: msg.labelIds || [],
            from: getHeader('From'),
            to: getHeader('To'),
            cc: getHeader('Cc'),
            bcc: getHeader('Bcc'),
            subject: getHeader('Subject'),
            date: getHeader('Date'),
            textBody: bodies.text,
            htmlBody: bodies.html,
            attachments,
          };
        } catch (e) {
          return { 
            id: msg.id, 
            threadId: msg.threadId,
            error: e?.message || 'Failed to fetch message in thread' 
          };
        }
      })
    );

    const firstMessage = messages[0];
    const lastMessage = messages[messages.length - 1];
    
    const getHeader = (headers, name) => headers.find((h) => h.name === name)?.value || null;
    const firstHeaders = firstMessage?.payload?.headers || [];
    const lastHeaders = lastMessage?.payload?.headers || [];

    return ok(res, {
      id: threadRes.data.id,
      historyId: threadRes.data.historyId,
      snippet: threadRes.data.snippet || null,
      messageCount: messages.length,
      subject: getHeader(firstHeaders, 'Subject'),
      from: getHeader(firstHeaders, 'From'),
      to: getHeader(firstHeaders, 'To'),
      firstDate: getHeader(firstHeaders, 'Date'),
      lastDate: getHeader(lastHeaders, 'Date'),
      messages: processedMessages,
    }, 'Thread fetched successfully');
  } catch (error) {
    console.error(error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired, please re-authenticate.');
    }
    if (error?.code === 404) {
      return fail(res, 404, 'Thread not found');
    }
    return fail(res, 500, error.message);
  }
};

module.exports = {
  getEmails,
  getEmailById,
  getreplayByGmailId,
  sendEmail,
  deleteEmail,
  getThreads,
  getThreadById,
  getSendedEmails,
  saveGmailSummary,
  getUnreadEmailCount,
  archiveEmail,
  getArchivedEmails,
};
