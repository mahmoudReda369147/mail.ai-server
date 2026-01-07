# Notification Cron Job - Summary

## Overview

The cron job now checks for pending calendar tasks and creates notifications when tasks are due within 1 hour.

## What It Does

Every 5 minutes, the cron job:

1. ✅ Logs: `🔔 I am working - Notification cron job running at: [timestamp]`
2. ✅ Fetches all calendar tasks with `status = 'pending'`
3. ✅ Compares each task's `dueDate` with the current date
4. ✅ If the difference is **less than 1 hour** (and positive), it creates a notification
5. ✅ Prevents duplicate notifications by checking if one already exists for that task

## Logic Flow

```javascript
For each pending calendar task:
  1. Calculate time difference between dueDate and current date
  2. If 0 < timeDifference <= 1 hour:
     - Check if notification already exists for this task
     - If no notification exists:
       - Create new notification with:
         * type: 'calendarTask'
         * title: "Upcoming Task: [task title]"
         * description: "Task is due in less than 1 hour at [date/time]"
         * priority: 'high' if task priority is 'high', else 'low'
         * taskId: task.id
         * userId: task.userId
```

## Example Console Output

```
🔔 I am working - Notification cron job running at: 2026-01-06T14:30:00.000Z
📋 Found 5 pending calendar tasks
✅ Created notification for task: Team Meeting (due at 1/6/2026, 3:15:00 PM)
✅ Created notification for task: Code Review (due at 1/6/2026, 3:45:00 PM)
🔔 Notifications created: 2
```

## Notification Table Structure

Created notifications have the following structure:

```json
{
  "id": "cuid...",
  "type": "calendarTask",
  "title": "Upcoming Task: Team Meeting",
  "description": "Task 'Team Meeting' is due in less than 1 hour at 1/6/2026, 3:15:00 PM",
  "priority": "high",
  "taskId": "task-id-here",
  "userId": "user-id-here",
  "isRead": false,
  "isActionDone": false,
  "createdAt": "2026-01-06T14:30:00.000Z",
  "updatedAt": "2026-01-06T14:30:00.000Z"
}
```

## Features

### ✅ Duplicate Prevention
- Checks if a notification already exists for a task before creating a new one
- Prevents spam notifications for the same task

### ✅ Time Window
- Only creates notifications for tasks due within 1 hour
- Ignores past tasks (timeDifference <= 0)
- Ignores tasks due more than 1 hour away

### ✅ Priority Mapping
- High priority tasks → High priority notification
- Medium/Low priority tasks → Low priority notification

## Testing

### Test Scenario 1: Task Due in 30 Minutes

1. Create a calendar task with `dueDate` = 30 minutes from now
2. Wait for cron job to run (max 5 minutes)
3. Check database for new notification

```sql
SELECT * FROM notifications WHERE "taskId" = 'your-task-id';
```

### Test Scenario 2: Task Due in 2 Hours

1. Create a calendar task with `dueDate` = 2 hours from now
2. Wait for cron job to run
3. **No notification should be created** (outside 1-hour window)

### Test Scenario 3: Duplicate Prevention

1. Create a calendar task with `dueDate` = 30 minutes from now
2. Wait for first notification to be created
3. Wait for cron to run again
4. **Only 1 notification should exist** (no duplicate)

## Manual Testing with SQL

### Create a Test Task Due in 30 Minutes

```sql
INSERT INTO calendar_tasks (id, title, description, "dueDate", status, priority, "userId", "createdAt", "updatedAt")
VALUES (
  'test-task-id',
  'Test Meeting',
  'This is a test task',
  NOW() + INTERVAL '30 minutes',
  'pending',
  'high',
  'your-user-id',
  NOW(),
  NOW()
);
```

### Check Notifications Created

```sql
SELECT * FROM notifications
WHERE type = 'calendarTask'
ORDER BY "createdAt" DESC;
```

## Next Steps (Optional)

You can extend the cron job to:

1. **Add more notification types:**
   - Tasks due today
   - Overdue tasks
   - Tasks due tomorrow

2. **Add email notifications:**
   - Send email when notification is created
   - Use nodemailer or SendGrid

3. **Add push notifications:**
   - Send to mobile apps
   - Use Firebase Cloud Messaging

4. **Add Slack/Discord notifications:**
   - Post to Slack channel
   - Send Discord webhook

## File Location

The cron job is located at:
- **[src/jobs/notificationJob.js](src/jobs/notificationJob.js)**

## Schedule

- **Frequency:** Every 5 minutes
- **Cron Expression:** `*/5 * * * *`
- **Runs at:** 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55 minutes of every hour

## How to Start

```bash
npm run dev
```

The cron job starts automatically when the server starts.

## Troubleshooting

### No Notifications Being Created

1. **Check if tasks exist:**
   ```sql
   SELECT * FROM calendar_tasks WHERE status = 'pending';
   ```

2. **Check task due dates:**
   ```sql
   SELECT title, "dueDate",
          EXTRACT(EPOCH FROM ("dueDate" - NOW())) / 3600 as hours_until_due
   FROM calendar_tasks
   WHERE status = 'pending';
   ```

3. **Check cron job logs:**
   - Look for: `📋 Found X pending calendar tasks`
   - Look for: `🔔 Notifications created: X`

### Duplicate Notifications

This shouldn't happen due to the duplicate check, but if it does:

1. **Check database for duplicates:**
   ```sql
   SELECT "taskId", COUNT(*)
   FROM notifications
   WHERE type = 'calendarTask'
   GROUP BY "taskId"
   HAVING COUNT(*) > 1;
   ```

2. **Delete duplicates (keep newest):**
   ```sql
   DELETE FROM notifications a
   USING notifications b
   WHERE a."taskId" = b."taskId"
     AND a.type = 'calendarTask'
     AND a."createdAt" < b."createdAt";
   ```

## Success! 🎉

Your notification cron job is now:
- ✅ Running every 5 minutes
- ✅ Checking pending calendar tasks
- ✅ Creating notifications for tasks due within 1 hour
- ✅ Preventing duplicate notifications
