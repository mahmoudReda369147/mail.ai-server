const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { createTemplate } = require('../controllers/templets');

// POST /api/templets/create
router.post('/create', authMiddleware, createTemplate);

module.exports = router;