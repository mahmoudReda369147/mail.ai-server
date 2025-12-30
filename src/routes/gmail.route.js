const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { getEmails, getEmailById, getreplayByGmailId, sendEmail, deleteEmail, getThreads, getSendedEmails, saveGmailSummary } = require('../controllers/gmail');
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

// DELETE /api/gmail/emails/:id
router.delete('/emails/:id', authMiddleware, deleteEmail);

// POST /api/gmail/summary
router.post('/summary', authMiddleware, saveGmailSummary);

// Gmail Watch (Push Notifications)
// POST /api/gmail/watch/setup
router.post('/watch/setup', authMiddleware, setupWatch);

// POST /api/gmail/watch/stop
router.post('/watch/stop', authMiddleware, stopWatch);

module.exports = router;
