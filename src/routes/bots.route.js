const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const {
  getAllBots,
  getBotById,
  createBot,
  updateBot,
  deleteBot
} = require('../controllers/bots');

// GET /api/bots - Get all bots for authenticated user
router.get('/', authMiddleware, getAllBots);

// GET /api/bots/:id - Get bot by ID
router.get('/:id', authMiddleware, getBotById);

// POST /api/bots - Create a new bot
router.post('/', authMiddleware, createBot);

// PUT /api/bots/:id - Update bot by ID
router.put('/:id', authMiddleware, updateBot);

// DELETE /api/bots/:id - Delete bot by ID
router.delete('/:id', authMiddleware, deleteBot);

module.exports = router;
