const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { addTask, editTask, getAllTasks, getTaskById, deleteTask, getTasksByGmailId } = require('../controllers/task');

// POST /api/tasks
router.post('/', authMiddleware, addTask);

// PUT /api/tasks/:id
router.put('/:id', authMiddleware, editTask);

// GET /api/tasks
router.get('/', authMiddleware, getAllTasks);

// GET /api/tasks/gmail/:gmailId
router.get('/gmail/:gmailId', authMiddleware, getTasksByGmailId);

// GET /api/tasks/:id
router.get('/:id', authMiddleware, getTaskById);

// DELETE /api/tasks/:id
router.delete('/:id', authMiddleware, deleteTask);

module.exports = router;
