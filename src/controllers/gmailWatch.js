const { setupGmailWatch, stopGmailWatch } = require('../services/gmailPubSub');
const { ok, fail } = require('../utils/response');

/**
 * Setup Gmail watch for authenticated user
 * Call this endpoint after user authenticates with Google
 */
const setupWatch = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    // Get topic name from environment or request
    const topicName = process.env.GMAIL_PUBSUB_TOPIC;

    if (!topicName) {
      return fail(res, 500, 'GMAIL_PUBSUB_TOPIC not configured in environment');
    }

    const watchResponse = await setupGmailWatch(user.id, topicName);

    return ok(res, {
      historyId: watchResponse.historyId,
      expiration: watchResponse.expiration
    }, 'Gmail watch setup successfully');
  } catch (error) {
    console.error('Error setting up Gmail watch:', error);
    return fail(res, 500, 'Failed to setup Gmail watch: ' + (error?.message || ''));
  }
};

/**
 * Stop Gmail watch for authenticated user
 */
const stopWatch = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    await stopGmailWatch(user.id);

    return ok(res, null, 'Gmail watch stopped successfully');
  } catch (error) {
    console.error('Error stopping Gmail watch:', error);
    return fail(res, 500, 'Failed to stop Gmail watch: ' + (error?.message || ''));
  }
};

module.exports = {
  setupWatch,
  stopWatch
};
