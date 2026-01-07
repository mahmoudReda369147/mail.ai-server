# Cron Job Setup - Notification System

This document explains the cron job setup for the notification system.

## Overview

A cron job has been set up to run every 5 minutes to process notifications. Currently, it logs "I am working" to demonstrate it's functioning correctly.

## Files Created/Modified

1. **src/jobs/notificationJob.js** - The cron job file
2. **src/server.js** - Modified to initialize the cron job on server start
3. **package.json** - Added `node-cron` dependency

## Cron Job Details

### Schedule
- **Frequency:** Every 5 minutes
- **Cron Expression:** `*/5 * * * *`
- **Description:** Runs at minute 0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55 of every hour

### What It Does
Currently, the cron job:
1. Runs every 5 minutes
2. Logs: `🔔 I am working - Notification cron job running at: [timestamp]`
3. Can be extended to create notifications based on tasks

## How to Use

### Starting the Server
The cron job starts automatically when you run the server:

```bash
# Development mode
npm run dev

# Production mode
npm start
```

You'll see this message when the server starts:
```
✅ Notification cron job started - running every 5 minutes
```

### Logs
Every 5 minutes, you'll see:
```
🔔 I am working - Notification cron job running at: 2026-01-06T13:45:00.000Z
```

## Extending the Cron Job

### Adding Notification Creation Logic

Edit `src/jobs/notificationJob.js` to add your notification logic:

```javascript
cron.schedule('*/5 * * * *', async () => {
  console.log('🔔 I am working - Notification cron job running at:', new Date().toISOString());

  try {
    // Example: Find tasks due within the next hour
    const oneHourFromNow = new Date();
    oneHourFromNow.setHours(oneHourFromNow.getHours() + 1);

    const upcomingTasks = await prisma.task.findMany({
      where: {
        isDoneTask: false,
        taskDate: {
          lte: oneHourFromNow,
          gte: new Date()
        }
      }
    });

    // Create notifications for upcoming tasks
    for (const task of upcomingTasks) {
      await prisma.notification.create({
        data: {
          type: 'task',
          title: `Upcoming Task: ${task.task}`,
          description: `Task due at ${task.taskDate}`,
          priority: task.priority === 'high' ? 'high' : 'low',
          taskId: task.id,
          userId: task.userId,
          isRead: false,
          isActionDone: false
        }
      });
    }

    console.log(`✅ Created ${upcomingTasks.length} notifications`);

  } catch (error) {
    console.error('❌ Error in notification cron job:', error);
  }
});
```

## Cron Schedule Examples

If you want to change the frequency, here are some examples:

```javascript
// Every minute
cron.schedule('* * * * *', ...);

// Every 10 minutes
cron.schedule('*/10 * * * *', ...);

// Every hour
cron.schedule('0 * * * *', ...);

// Every day at 9:00 AM
cron.schedule('0 9 * * *', ...);

// Every Monday at 8:00 AM
cron.schedule('0 8 * * 1', ...);

// Every 30 minutes
cron.schedule('*/30 * * * *', ...);
```

### Cron Expression Format
```
┌────────────── minute (0 - 59)
│ ┌──────────── hour (0 - 23)
│ │ ┌────────── day of month (1 - 31)
│ │ │ ┌──────── month (1 - 12)
│ │ │ │ ┌────── day of week (0 - 6) (Sunday to Saturday)
│ │ │ │ │
* * * * *
```

## Testing

### Manual Testing
1. Start the server: `npm run dev`
2. Wait for 5 minutes
3. Check the console logs for: `🔔 I am working - Notification cron job running at: [timestamp]`

### Immediate Testing
To test immediately without waiting, you can temporarily change the schedule to run every minute:

```javascript
// In src/jobs/notificationJob.js
cron.schedule('* * * * *', async () => {
  // Your code here
});
```

**Remember to change it back to `*/5 * * * *` after testing!**

## Stopping the Cron Job

The cron job runs as long as the server is running. To stop it:
1. Stop the server (Ctrl+C)
2. The cron job will automatically stop

## Multiple Cron Jobs

You can add more cron jobs by:

1. Creating new job files in `src/jobs/`
2. Importing and starting them in `src/server.js`

Example:

```javascript
// src/jobs/reminderJob.js
const cron = require('node-cron');

const startReminderJob = () => {
  cron.schedule('0 9 * * *', async () => {
    console.log('📧 Sending daily reminders...');
    // Your reminder logic here
  });
  console.log('✅ Reminder job started - running daily at 9 AM');
};

module.exports = { startReminderJob };
```

```javascript
// src/server.js
const { startNotificationJob } = require('./jobs/notificationJob');
const { startReminderJob } = require('./jobs/reminderJob');

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);

  // Start all cron jobs
  startNotificationJob();
  startReminderJob();
});
```

## Troubleshooting

### Cron Job Not Running
1. Check if the server started successfully
2. Look for: `✅ Notification cron job started - running every 5 minutes`
3. If not present, check for errors in console

### No Logs After 5 Minutes
1. Verify the cron expression is correct: `*/5 * * * *`
2. Check server is still running
3. Look for any error messages in console

### Cron Job Running Too Often
1. Check the cron expression
2. Ensure you're using `*/5 * * * *` (every 5 minutes) not `* * * * *` (every minute)

## Production Considerations

### 1. Error Handling
Always wrap your cron job logic in try-catch blocks to prevent crashes.

### 2. Logging
Consider using a proper logging library (e.g., Winston) instead of console.log.

### 3. Database Connections
Ensure Prisma connections are properly managed to avoid connection pool exhaustion.

### 4. Performance
- Avoid long-running operations that could block the next execution
- Use database indexes for queries in cron jobs
- Consider using queues for heavy processing

### 5. Monitoring
- Set up alerts for when cron jobs fail
- Track execution time
- Monitor resource usage

## Next Steps

1. ✅ Cron job is running every 5 minutes
2. 🔄 Add logic to check for upcoming tasks
3. 🔄 Create notifications for tasks due soon
4. 🔄 Create notifications for overdue tasks
5. 🔄 Send notification emails (optional)
6. 🔄 Add calendar event reminders

## Resources

- [node-cron Documentation](https://www.npmjs.com/package/node-cron)
- [Cron Expression Generator](https://crontab.guru/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
