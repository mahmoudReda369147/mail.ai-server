const express = require('express');
const { uploadPdf } = require('../controllers/pdf');

const router = express.Router();

router.post('/upload-pdf', uploadPdf);

module.exports = router;