const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { getEmails, getEmailById, getreplayByGmailId, sendEmail, deleteEmail, getThreads, getThreadById, getSendedEmails, saveGmailSummary, getUnreadEmailCount, archiveEmail, getArchivedEmails } = require('../controllers/gmail');
const { setupWatch, stopWatch } = require('../controllers/gmailWatch');

// GET /api/gmail/emails
router.get('/emails', authMiddleware, getEmails);

// GET /api/gmail/emails/:id
router.get('/emails/:id', authMiddleware, getEmailById);

// POST /api/gmail/emails/reply/:id
router.post('/emails/reply/:id', authMiddleware, getreplayByGmailId);

// POST /api/gmail/send
router.post('/send', authMiddleware, sendEmail);

// GET /api/gmail/sended
router.get('/sended', authMiddleware, getSendedEmails);

// GET /api/gmail/threads
router.get('/threads', authMiddleware, getThreads);

// GET /api/gmail/threads/:id
router.get('/threads/:id', authMiddleware, getThreadById);

// DELETE /api/gmail/emails/:id
router.delete('/emails/:id', authMiddleware, deleteEmail);

// POST /api/gmail/summary
router.post('/summary', authMiddleware, saveGmailSummary);

// GET /api/gmail/unread-count
router.get('/unread-count', authMiddleware, getUnreadEmailCount);

// PATCH /api/gmail/emails/:id/archive
router.patch('/emails/:id/archive', authMiddleware, archiveEmail);

// GET /api/gmail/archived
router.get('/archived', authMiddleware, getArchivedEmails);

// Gmail Watch (Push Notifications)
// POST /api/gmail/watch/setup
router.post('/watch/setup', authMiddleware, setupWatch);

// POST /api/gmail/watch/stop
router.post('/watch/stop', authMiddleware, stopWatch);

module.exports = router;
