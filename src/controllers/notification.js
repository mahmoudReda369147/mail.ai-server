const prisma = require('../config/database');
const { ok, fail } = require('../utils/response');

/**
 * GET /api/notifications
 * Get all notifications for the authenticated user
 * Only returns non-deleted notifications
 */
const getNotifications = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { page = 1, limit = 5, isRead, type, priority } = req.query;

    // Build where clause
    const whereClause = {
      userId: user.id,
      isDeleted: false // Only fetch non-deleted notifications
    };

    // Optional filters
    if (isRead !== undefined) {
      whereClause.isRead = isRead === 'true';
    }

    if (type) {
      whereClause.type = type;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    // Pagination
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    // Fetch notifications
    const notifications = await prisma.notification.findMany({
      where: whereClause,
      orderBy: {
        createdAt: 'desc'
      },
      skip,
      take: limitNum
    });

    // Get total count for pagination
    const total = await prisma.notification.count({ where: whereClause });

    // Get unread count
    const unreadCount = await prisma.notification.count({
      where: {
        userId: user.id,
        isDeleted: false,
        isRead: false
      }
    });

    return ok(res, notifications, 'Notifications fetched successfully', {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      unreadCount
    });
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return fail(res, 500, 'Failed to fetch notifications: ' + (error?.message || ''));
  }
};

/**
 * PUT /api/notifications/mark-all-read
 * Mark all notifications as read for the authenticated user
 */
const markAllAsRead = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    // Update all unread, non-deleted notifications for this user
    const result = await prisma.notification.updateMany({
      where: {
        userId: user.id,
        isRead: false,
        isDeleted: false
      },
      data: {
        isRead: true,
        updatedAt: new Date()
      }
    });

    return ok(res, {
      updatedCount: result.count,
      message: `Marked ${result.count} notification(s) as read`
    }, `Successfully marked ${result.count} notification(s) as read`);
  } catch (error) {
    console.error('Error marking notifications as read:', error);
    return fail(res, 500, 'Failed to mark notifications as read: ' + (error?.message || ''));
  }
};

/**
 * DELETE /api/notifications/:id
 * Soft delete a notification (sets isDeleted to true)
 */
const deleteNotification = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Notification ID is required');
    }

    // Check if notification exists and belongs to user
    const notification = await prisma.notification.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });

    if (!notification) {
      return fail(res, 404, 'Notification not found');
    }

    // Check if already deleted
    if (notification.isDeleted) {
      return fail(res, 400, 'Notification is already deleted');
    }

    // Soft delete - set isDeleted to true
    await prisma.notification.update({
      where: {
        id: id
      },
      data: {
        isDeleted: true,
        updatedAt: new Date()
      }
    });

    return ok(res, { id, isDeleted: true }, 'Notification deleted successfully');
  } catch (error) {
    console.error('Error deleting notification:', error);
    return fail(res, 500, 'Failed to delete notification: ' + (error?.message || ''));
  }
};

/**
 * PUT /api/notifications/:id/mark-read
 * Mark a single notification as read
 */
const markAsRead = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Notification ID is required');
    }

    // Check if notification exists and belongs to user
    const notification = await prisma.notification.findFirst({
      where: {
        id: id,
        userId: user.id,
        isDeleted: false
      }
    });

    if (!notification) {
      return fail(res, 404, 'Notification not found');
    }

    // Mark as read
    const updatedNotification = await prisma.notification.update({
      where: {
        id: id
      },
      data: {
        isRead: true,
        updatedAt: new Date()
      }
    });

    return ok(res, updatedNotification, 'Notification marked as read');
  } catch (error) {
    console.error('Error marking notification as read:', error);
    return fail(res, 500, 'Failed to mark notification as read: ' + (error?.message || ''));
  }
};

/**
 * DELETE /api/notifications/bulk-delete
 * Soft delete multiple notifications
 */
const bulkDeleteNotifications = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { notificationIds } = req.body;

    if (!notificationIds || !Array.isArray(notificationIds) || notificationIds.length === 0) {
      return fail(res, 400, 'notificationIds array is required');
    }

    // Soft delete multiple notifications
    const result = await prisma.notification.updateMany({
      where: {
        id: {
          in: notificationIds
        },
        userId: user.id,
        isDeleted: false
      },
      data: {
        isDeleted: true,
        updatedAt: new Date()
      }
    });

    return ok(res, {
      deletedCount: result.count,
      message: `Deleted ${result.count} notification(s)`
    }, `Successfully deleted ${result.count} notification(s)`);
  } catch (error) {
    console.error('Error bulk deleting notifications:', error);
    return fail(res, 500, 'Failed to bulk delete notifications: ' + (error?.message || ''));
  }
};

module.exports = {
  getNotifications,
  markAllAsRead,
  deleteNotification,
  markAsRead,
  bulkDeleteNotifications
};
