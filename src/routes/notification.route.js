const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const {
  getNotifications,
  markAllAsRead,
  deleteNotification,
  markAsRead,
  bulkDeleteNotifications
} = require('../controllers/notification');

// GET /api/notifications - Get all notifications for user
router.get('/', authMiddleware, getNotifications);

// PUT /api/notifications/mark-all-read - Mark all notifications as read
router.put('/mark-all-read', authMiddleware, markAllAsRead);

// DELETE /api/notifications/bulk-delete - Bulk soft delete notifications (must be before /:id)
router.post('/bulk-delete', authMiddleware, bulkDeleteNotifications);

// PUT /api/notifications/:id/mark-read - Mark single notification as read
router.put('/:id/mark-read', authMiddleware, markAsRead);

// DELETE /api/notifications/:id - Soft delete a notification
router.delete('/:id', authMiddleware, deleteNotification);

module.exports = router;
