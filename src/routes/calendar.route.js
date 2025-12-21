const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { addTask, getTasks, getTaskById, updateTask, deleteTask } = require('../controllers/calendar');

// POST /api/calendar/tasks
router.post('/tasks', authMiddleware, addTask);

// GET /api/calendar/tasks
router.get('/tasks', authMiddleware, getTasks);

// GET /api/calendar/tasks/:id
router.get('/tasks/:id', authMiddleware, getTaskById);

// PUT /api/calendar/tasks/:id
router.put('/tasks/:id', authMiddleware, updateTask);

// DELETE /api/calendar/tasks/:id
router.delete('/tasks/:id', authMiddleware, deleteTask);

module.exports = router;
