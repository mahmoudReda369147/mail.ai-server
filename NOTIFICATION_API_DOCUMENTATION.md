# Notification API Documentation

Complete API documentation for the notification system with soft delete functionality.

## Overview

The notification system provides endpoints to:
- Get all notifications for a user
- Mark all notifications as read
- Mark a single notification as read
- Soft delete notifications (single or bulk)

All operations require authentication via JWT token.

## Base URL

```
/api/notifications
```

---

## Endpoints

### 1. Get All Notifications

Get all notifications for the authenticated user (excludes soft-deleted notifications).

**Endpoint:** `GET /api/notifications`

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Query Parameters:**
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| page | number | No | 1 | Page number for pagination |
| limit | number | No | 20 | Number of items per page |
| isRead | boolean | No | - | Filter by read status (true/false) |
| type | string | No | - | Filter by type ('task' or 'calendarTask') |
| priority | string | No | - | Filter by priority ('high' or 'low') |

**Example Request:**
```bash
# Get all notifications
GET /api/notifications

# Get unread notifications only
GET /api/notifications?isRead=false

# Get high priority notifications
GET /api/notifications?priority=high

# Get calendar task notifications with pagination
GET /api/notifications?type=calendarTask&page=1&limit=10
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": [
    {
      "id": "clxxx...",
      "type": "calendarTask",
      "title": "Upcoming Task: Team Meeting",
      "description": "Task 'Team Meeting' is due in less than 1 hour at 1/7/2026, 3:15:00 PM",
      "priority": "high",
      "taskId": "task-123",
      "userId": "user-456",
      "isRead": false,
      "isActionDone": false,
      "isDeleted": false,
      "createdAt": "2026-01-07T14:30:00.000Z",
      "updatedAt": "2026-01-07T14:30:00.000Z"
    },
    {
      "id": "clyyy...",
      "type": "task",
      "title": "Task Reminder",
      "description": "Don't forget to complete your task",
      "priority": "low",
      "taskId": "task-789",
      "userId": "user-456",
      "isRead": true,
      "isActionDone": false,
      "isDeleted": false,
      "createdAt": "2026-01-07T10:00:00.000Z",
      "updatedAt": "2026-01-07T12:00:00.000Z"
    }
  ],
  "message": "Notifications fetched successfully",
  "meta": {
    "total": 25,
    "page": 1,
    "limit": 20,
    "totalPages": 2,
    "unreadCount": 5
  }
}
```

---

### 2. Mark All Notifications as Read

Mark all unread notifications as read for the authenticated user.

**Endpoint:** `PUT /api/notifications/mark-all-read`

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**Example Request:**
```bash
PUT /api/notifications/mark-all-read
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "updatedCount": 5,
    "message": "Marked 5 notification(s) as read"
  },
  "message": "Successfully marked 5 notification(s) as read"
}
```

---

### 3. Mark Single Notification as Read

Mark a specific notification as read.

**Endpoint:** `PUT /api/notifications/:id/mark-read`

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Notification ID |

**Example Request:**
```bash
PUT /api/notifications/clxxx123/mark-read
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "id": "clxxx123",
    "type": "calendarTask",
    "title": "Upcoming Task: Team Meeting",
    "description": "Task 'Team Meeting' is due in less than 1 hour",
    "priority": "high",
    "taskId": "task-123",
    "userId": "user-456",
    "isRead": true,
    "isActionDone": false,
    "isDeleted": false,
    "createdAt": "2026-01-07T14:30:00.000Z",
    "updatedAt": "2026-01-07T14:45:00.000Z"
  },
  "message": "Notification marked as read"
}
```

**Error Response (404):**
```json
{
  "status": "error",
  "message": "Notification not found"
}
```

---

### 4. Delete Notification (Soft Delete)

Soft delete a notification by setting `isDeleted` to true. The notification remains in the database but won't appear in queries.

**Endpoint:** `DELETE /api/notifications/:id`

**Headers:**
```
Authorization: Bearer <your-jwt-token>
```

**URL Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| id | string | Yes | Notification ID |

**Example Request:**
```bash
DELETE /api/notifications/clxxx123
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "id": "clxxx123",
    "isDeleted": true
  },
  "message": "Notification deleted successfully"
}
```

**Error Responses:**

**404 - Not Found:**
```json
{
  "status": "error",
  "message": "Notification not found"
}
```

**400 - Already Deleted:**
```json
{
  "status": "error",
  "message": "Notification is already deleted"
}
```

---

### 5. Bulk Delete Notifications

Soft delete multiple notifications at once.

**Endpoint:** `DELETE /api/notifications/bulk-delete`

**Headers:**
```
Authorization: Bearer <your-jwt-token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "notificationIds": ["clxxx123", "clyyy456", "clzzz789"]
}
```

**Example Request:**
```bash
DELETE /api/notifications/bulk-delete
Content-Type: application/json

{
  "notificationIds": ["clxxx123", "clyyy456", "clzzz789"]
}
```

**Success Response (200):**
```json
{
  "status": "success",
  "data": {
    "deletedCount": 3,
    "message": "Deleted 3 notification(s)"
  },
  "message": "Successfully deleted 3 notification(s)"
}
```

**Error Response (400):**
```json
{
  "status": "error",
  "message": "notificationIds array is required"
}
```

---

## Notification Schema

```javascript
{
  id: String (cuid),
  type: Enum ('task' | 'calendarTask'),
  title: String,
  description: String?,
  priority: Enum ('high' | 'low'),
  taskId: String?,
  userId: String,
  isRead: Boolean (default: false),
  isActionDone: Boolean (default: false),
  isDeleted: Boolean (default: false),
  createdAt: DateTime,
  updatedAt: DateTime
}
```

---

## Complete Usage Examples

### Example 1: Get Unread Notifications

```javascript
const response = await fetch('/api/notifications?isRead=false', {
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log('Unread notifications:', data.data);
console.log('Unread count:', data.meta.unreadCount);
```

### Example 2: Mark All as Read

```javascript
const response = await fetch('/api/notifications/mark-all-read', {
  method: 'PUT',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log(`Marked ${data.data.updatedCount} notifications as read`);
```

### Example 3: Delete Single Notification

```javascript
const notificationId = 'clxxx123';

const response = await fetch(`/api/notifications/${notificationId}`, {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`
  }
});

const data = await response.json();
console.log('Deleted:', data.data.id);
```

### Example 4: Bulk Delete Notifications

```javascript
const idsToDelete = ['clxxx123', 'clyyy456', 'clzzz789'];

const response = await fetch('/api/notifications/bulk-delete', {
  method: 'DELETE',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    notificationIds: idsToDelete
  })
});

const data = await response.json();
console.log(`Deleted ${data.data.deletedCount} notifications`);
```

---

## Error Codes

| Status Code | Description |
|-------------|-------------|
| 200 | Success |
| 400 | Bad Request (missing/invalid parameters) |
| 401 | Unauthorized (missing/invalid token) |
| 404 | Not Found (notification doesn't exist) |
| 500 | Internal Server Error |

---

## Soft Delete Behavior

### What is Soft Delete?

Soft delete means the notification is not permanently removed from the database. Instead, the `isDeleted` field is set to `true`.

**Benefits:**
- ✅ Data retention for auditing
- ✅ Ability to restore deleted notifications
- ✅ Maintain referential integrity
- ✅ Track deletion history

### Querying Behavior

- **GET /api/notifications** - Only returns notifications where `isDeleted = false`
- **DELETE /api/notifications/:id** - Sets `isDeleted = true`
- Deleted notifications are excluded from all user-facing queries

### Database Access

Soft-deleted notifications remain in the database and can be accessed directly via SQL:

```sql
-- View all notifications including deleted ones
SELECT * FROM notifications WHERE "userId" = 'user-id';

-- View only deleted notifications
SELECT * FROM notifications WHERE "userId" = 'user-id' AND "isDeleted" = true;

-- Restore a deleted notification (manual SQL)
UPDATE notifications SET "isDeleted" = false WHERE id = 'notification-id';

-- Permanently delete notifications (hard delete)
DELETE FROM notifications WHERE "isDeleted" = true AND "createdAt" < NOW() - INTERVAL '30 days';
```

---

## Testing

### Using cURL

```bash
# 1. Get all notifications
curl -X GET http://localhost:3000/api/notifications \
  -H "Authorization: Bearer YOUR_TOKEN"

# 2. Get unread notifications
curl -X GET "http://localhost:3000/api/notifications?isRead=false" \
  -H "Authorization: Bearer YOUR_TOKEN"

# 3. Mark all as read
curl -X PUT http://localhost:3000/api/notifications/mark-all-read \
  -H "Authorization: Bearer YOUR_TOKEN"

# 4. Mark single notification as read
curl -X PUT http://localhost:3000/api/notifications/NOTIFICATION_ID/mark-read \
  -H "Authorization: Bearer YOUR_TOKEN"

# 5. Delete single notification
curl -X DELETE http://localhost:3000/api/notifications/NOTIFICATION_ID \
  -H "Authorization: Bearer YOUR_TOKEN"

# 6. Bulk delete notifications
curl -X DELETE http://localhost:3000/api/notifications/bulk-delete \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notificationIds": ["id1", "id2", "id3"]}'
```

### Using Postman

Import this collection:

```json
{
  "info": {
    "name": "Notification API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Get All Notifications",
      "request": {
        "method": "GET",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/notifications",
          "host": ["{{baseUrl}}"],
          "path": ["api", "notifications"]
        }
      }
    },
    {
      "name": "Mark All as Read",
      "request": {
        "method": "PUT",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/notifications/mark-all-read",
          "host": ["{{baseUrl}}"],
          "path": ["api", "notifications", "mark-all-read"]
        }
      }
    },
    {
      "name": "Delete Notification",
      "request": {
        "method": "DELETE",
        "header": [
          {
            "key": "Authorization",
            "value": "Bearer {{token}}"
          }
        ],
        "url": {
          "raw": "{{baseUrl}}/api/notifications/:id",
          "host": ["{{baseUrl}}"],
          "path": ["api", "notifications", ":id"],
          "variable": [
            {
              "key": "id",
              "value": ""
            }
          ]
        }
      }
    }
  ]
}
```

---

## Integration with Frontend

### React Example

```javascript
import { useState, useEffect } from 'react';

function NotificationList() {
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    const response = await fetch('/api/notifications', {
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    const data = await response.json();
    setNotifications(data.data);
    setUnreadCount(data.meta.unreadCount);
  };

  const markAllAsRead = async () => {
    await fetch('/api/notifications/mark-all-read', {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    fetchNotifications();
  };

  const deleteNotification = async (id) => {
    await fetch(`/api/notifications/${id}`, {
      method: 'DELETE',
      headers: {
        'Authorization': `Bearer ${localStorage.getItem('token')}`
      }
    });
    fetchNotifications();
  };

  return (
    <div>
      <h2>Notifications ({unreadCount} unread)</h2>
      <button onClick={markAllAsRead}>Mark All as Read</button>

      {notifications.map(notification => (
        <div key={notification.id} className={notification.isRead ? '' : 'unread'}>
          <h3>{notification.title}</h3>
          <p>{notification.description}</p>
          <span>{notification.priority}</span>
          <button onClick={() => deleteNotification(notification.id)}>Delete</button>
        </div>
      ))}
    </div>
  );
}
```

---

## Files Created/Modified

1. ✅ **prisma/schema.prisma** - Added `isDeleted` field to Notification model
2. ✅ **src/controllers/notification.js** - Created notification controller with 5 endpoints
3. ✅ **src/routes/notification.route.js** - Created notification routes
4. ✅ **src/server.js** - Registered notification routes

---

## Summary

Your notification system now has:

✅ **Get all notifications** - with pagination and filtering
✅ **Mark all as read** - bulk update all notifications
✅ **Mark single as read** - update individual notification
✅ **Soft delete single** - safe deletion with data retention
✅ **Bulk soft delete** - delete multiple notifications at once
✅ **Unread count** - always returned in GET endpoint
✅ **Filtering** - by type, priority, read status
✅ **Pagination** - for large notification lists

All operations require authentication and only work with the user's own notifications! 🎉
