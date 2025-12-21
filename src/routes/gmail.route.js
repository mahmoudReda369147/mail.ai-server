const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { getEmails, getEmailById, getreplayByGmailId, sendEmail, deleteEmail, getThreads, getSendedEmails } = require('../controllers/gmail');

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

module.exports = router;
