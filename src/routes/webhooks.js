const express = require('express');
const router = express.Router();
const { handleWebhook } = require('../controllers/webhooks');

router.post('/gmail', handleWebhook);

module.exports = router;