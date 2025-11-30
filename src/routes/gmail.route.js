const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { getEmails, getEmailById } = require('../controllers/gmail');

// GET /api/gmail/emails
router.get('/emails', authMiddleware, getEmails);
// GET /api/gmail/emails/:id
router.get('/emails/:id', authMiddleware, getEmailById);

module.exports = router;
