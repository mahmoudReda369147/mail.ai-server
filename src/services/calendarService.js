const { google } = require('googleapis');
const prisma = require('../config/database');

/**
 * Get authenticated Google Calendar instance for a user
 * @param {string} userId - User ID from database
 * @returns {Promise<Object>} - Calendar API instance
 */
async function getCalendarInstance(userId) {
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

  return google.calendar({ version: 'v3', auth: oauth2Client });
}

// Map internal priority to Google Calendar colorId (1-11)
function mapPriorityToColorId(priority) {
  switch ((priority || '').toLowerCase()) {
    case 'high':
      return '11'; // Tomato (red)
    case 'medium':
      return '6'; // Tangerine (orange)
    case 'low':
    default:
      return '10'; // Basil (green)
  }
}

/**
 * Create an event in Google Calendar
 * @param {string} userId - User ID
 * @param {Object} eventData - Event details
 * @returns {Promise<Object>} - Created event from Google Calendar
 */
async function createCalendarEvent(userId, eventData) {
  const calendar = await getCalendarInstance(userId);

  const { title, description, dueDate, priority } = eventData;

  // Set event time to the due date at 9:00 AM if no time specified
  const startDateTime = new Date(dueDate);
  const endDateTime = new Date(dueDate);
  endDateTime.setHours(endDateTime.getHours() + 1); // 1 hour duration

  const event = {
    summary: title,
    description: description || '',
    colorId: mapPriorityToColorId(priority),
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'UTC',
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 24 * 60 }, // 1 day before
        { method: 'popup', minutes: 30 }, // 30 minutes before
      ],
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return response.data;
}

/**
 * Update an event in Google Calendar
 * @param {string} userId - User ID
 * @param {string} eventId - Google Calendar event ID
 * @param {Object} eventData - Updated event details
 * @returns {Promise<Object>} - Updated event from Google Calendar
 */
async function updateCalendarEvent(userId, eventId, eventData) {
  const calendar = await getCalendarInstance(userId);

  const { title, description, dueDate, priority } = eventData;

  const startDateTime = new Date(dueDate);
  const endDateTime = new Date(dueDate);
  endDateTime.setHours(endDateTime.getHours() + 1);

  const event = {
    summary: title,
    description: description || '',
    colorId: mapPriorityToColorId(priority),
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: 'UTC',
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: 'UTC',
    },
  };

  const response = await calendar.events.update({
    calendarId: 'primary',
    eventId: eventId,
    resource: event,
  });

  return response.data;
}

/**
 * Delete an event from Google Calendar
 * @param {string} userId - User ID
 * @param {string} eventId - Google Calendar event ID
 * @returns {Promise<void>}
 */
async function deleteCalendarEvent(userId, eventId) {
  const calendar = await getCalendarInstance(userId);

  await calendar.events.delete({
    calendarId: 'primary',
    eventId: eventId,
  });
}

/**
 * Create a meeting event in Google Calendar
 * @param {string} userId - User ID
 * @param {Object} meetingData - Meeting details from AI extraction
 * @returns {Promise<Object>} - Created event from Google Calendar
 */
async function createMeetingEvent(userId, meetingData) {
  const calendar = await getCalendarInstance(userId);

  const { title, date, time, duration, agenda } = meetingData;

  // Parse the date and time
  let startDateTime;
  if (date && time) {
    startDateTime = new Date(`${date}T${time}:00`);
  } else if (date) {
    // If no time specified, default to 9:00 AM
    startDateTime = new Date(date);
    startDateTime.setHours(9, 0, 0, 0);
  } else {
    throw new Error('Meeting date is required');
  }

  // Calculate end time based on duration
  let endDateTime = new Date(startDateTime);
  if (duration) {
    // Parse duration (e.g., "1 hour", "30 minutes", "1.5 hours")
    const durationMatch = duration.match(/(\d+\.?\d*)\s*(hour|minute|hr|min)/i);
    if (durationMatch) {
      const value = parseFloat(durationMatch[1]);
      const unit = durationMatch[2].toLowerCase();

      if (unit.startsWith('hour') || unit === 'hr') {
        endDateTime.setMinutes(endDateTime.getMinutes() + (value * 60));
      } else {
        endDateTime.setMinutes(endDateTime.getMinutes() + value);
      }
    } else {
      // Default to 1 hour if duration format is unclear
      endDateTime.setHours(endDateTime.getHours() + 1);
    }
  } else {
    // Default to 1 hour
    endDateTime.setHours(endDateTime.getHours() + 1);
  }

  const event = {
    summary: title || 'Meeting',
    description: agenda || '',
    colorId: '9', // Blue for meetings
    start: {
      dateTime: startDateTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    end: {
      dateTime: endDateTime.toISOString(),
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    },
    reminders: {
      useDefault: false,
      overrides: [
        { method: 'email', minutes: 60 }, // 1 hour before
        { method: 'popup', minutes: 15 }, // 15 minutes before
      ],
    },
  };

  const response = await calendar.events.insert({
    calendarId: 'primary',
    resource: event,
  });

  return response.data;
}

module.exports = {
  createCalendarEvent,
  updateCalendarEvent,
  deleteCalendarEvent,
  createMeetingEvent,
};
