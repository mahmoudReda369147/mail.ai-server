const { google } = require('googleapis');
const prisma = require('../config/database');
const agent = require('../services/agent');
const oauth2Client = require('../services/googleClint');
const { ok, fail } = require('../utils/response');

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
    const listRes = await gmail.users.messages.list({
      userId: 'me',
      maxResults,
      pageToken,
      q,
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



            return {
              id: msgRes.data.id,
              threadId: msgRes.data.threadId,
              snippet: msgRes.data.snippet || null,
              internalDate: msgRes.data.internalDate || null,
              from: getHeader('From'),
              to: getHeader('To'),
              subject: getHeader('Subject'),
              date: getHeader('Date'),
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
    const agentResponse = await agent(process.env.SYSTEM_PROMPET_FOR_MESSAGE,[],"the email is : " + (email.textBody || email.htmlBody || ''));
    console.log("agentResponse", agentResponse);
    const agentJson = safeParseAgentJson(agentResponse) || {};
    return ok(res, { ...email, ...agentJson }, 'Email fetched successfully');
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
    return ok(res, {reply:agentResponse }, 'Email fetched successfully');
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

    const { to, subject, body, cc, bcc } = req.body;
    
    if (!to || !subject || !body) {
      return fail(res, 400, 'Required fields: to, subject, body');
    }

    oauth2Client.setCredentials({
      access_token: user.accessToken || undefined,
      refresh_token: user.refreshToken || undefined,
    });

    const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

    // Create email message
    const emailLines = [];
    emailLines.push(`To: ${to}`);
    if (cc) emailLines.push(`Cc: ${cc}`);
    if (bcc) emailLines.push(`Bcc: ${bcc}`);
    emailLines.push(`Subject: ${subject}`);
    emailLines.push(''); // Empty line between headers and body
    emailLines.push(body);

    const emailMessage = emailLines.join('\r\n');

    // Encode message in base64url
    const encodedMessage = Buffer.from(emailMessage)
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    // Send email
    const response = await gmail.users.messages.send({
      userId: 'me',
      requestBody: {
        raw: encodedMessage
      }
    });

    return ok(res, { 
      id: response.data.id, 
      threadId: response.data.threadId,
      message: 'Email sent successfully' 
    }, 'Email sent successfully');
  } catch (error) {
    console.error('Error sending email:', error);
    if (error?.code === 401) {
      return fail(res, 401, 'Token expired or invalid. Please re-authenticate.');
    }
    return fail(res, 500, 'Failed to send email: ' + (error?.message || ''));
  }
};

module.exports = { getEmails, getEmailById, getreplayByGmailId, sendEmail };
