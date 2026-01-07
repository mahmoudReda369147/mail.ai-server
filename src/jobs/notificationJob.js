const cron = require('node-cron');
const prisma = require('../config/database');

/**
 * Cron job that runs every 5 minutes to process notifications
 * Schedule: every 5 minutes
 */
const startNotificationJob = () => {
  // Run every 2 minutes
  cron.schedule('*/1 * * * *', async () => {
    console.log('🔔 I am working - Notification cron job running at:', new Date().toISOString());

    try {
      const currentDate = new Date();
      const oneHour = 60 * 60 * 1000; // 1 hour in milliseconds
      let notificationsCreated = 0;

      // ============================================
      // 1. Check Calendar Tasks (pending status)
      // ============================================
      const pendingCalendarTasks = await prisma.calendarTask.findMany({
        where: {
          status: 'pending'
        }
      });

      console.log(`📋 Found ${pendingCalendarTasks.length} pending calendar tasks`);

      for (const task of pendingCalendarTasks) {
        const dueDate = new Date(task.dueDate);
        const timeDifference = dueDate.getTime() - currentDate.getTime();

        if (timeDifference > 0 && timeDifference <= oneHour) {
          // Check if notification already exists for this task
          const existingNotification = await prisma.notification.findFirst({
            where: {
              taskId: task.id,
              type: 'calendarTask'
            }
          });

          // Only create notification if it doesn't exist
          if (!existingNotification) {
            await prisma.notification.create({
              data: {
                type: 'calendarTask',
                title: `Upcoming Clender Meet: ${task.title}`,
                description: `Meet "${task.title}" is due in less than 1 hour at ${dueDate.toLocaleString()}`,
                priority: 'high',
                taskId: task.id,
                userId: task.userId,
                isRead: false,
                isActionDone: false
              }
            });

            notificationsCreated++;
            console.log(`✅ Created notification for calendar task: ${task.title} (due at ${dueDate.toLocaleString()})`);
          }
        }
      }

      // ============================================
      // 2. Check Regular Tasks (not done, has taskDate)
      // ============================================
      const pendingTasks = await prisma.task.findMany({
        where: {
          isDoneTask: false,
          taskDate: {
            not: null
          }
        }
      });

      console.log(`📋 Found ${pendingTasks.length} pending regular tasks with taskDate`);

      for (const task of pendingTasks) {
        if (!task.taskDate) continue;

        const taskDate = new Date(task.taskDate);
        const timeDifference = taskDate.getTime() - currentDate.getTime();

        if (timeDifference > 0 && timeDifference <= oneHour) {
          // Check if notification already exists for this task
          const existingNotification = await prisma.notification.findFirst({
            where: {
              taskId: task.id,
              type: 'task'
            }
          });

          // Only create notification if it doesn't exist
          if (!existingNotification) {
            await prisma.notification.create({
              data: {
                type: 'task',
                title: `Upcoming Task: ${task.task}`,
                description: `Task "${task.task}" is due in less than 1 hour at ${taskDate.toLocaleString()}`,
                priority: 'high',
                taskId: task.id,
                userId: task.userId,
                isRead: false,
                isActionDone: false
              }
            });

            notificationsCreated++;
            console.log(`✅ Created notification for task: ${task.task} (due at ${taskDate.toLocaleString()})`);
          }
        }
      }

      console.log(`🔔 Notifications created: ${notificationsCreated}`);

    } catch (error) {
      console.error('❌ Error in notification cron job:', error);
    }
  });

  console.log('✅ Notification cron job started - running every 2 minutes');
};

module.exports = { startNotificationJob };
