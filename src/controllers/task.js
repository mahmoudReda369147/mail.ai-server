const prisma = require('../config/database');
const { ok, created, fail } = require('../utils/response');

/**
 * POST /api/tasks
 * Create a new task
 */
const addTask = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { task, taskDate, isDoneTask, priority, gmailId } = req.body;

    if (!task) {
      return fail(res, 400, 'task is required');
    }

    const taskData = {
      task,
      userId: user.id,
      taskDate: taskDate ? new Date(taskDate) : null,
      isDoneTask: isDoneTask !== undefined ? isDoneTask : false,
      priority: priority || 'medium',
      gmailId: gmailId || null,
    };

    const newTask = await prisma.task.create({
      data: taskData,
    });

    return created(res, newTask, 'Task created successfully');
  } catch (error) {
    console.error('Error creating task:', error);
    return fail(res, 500, 'Failed to create task: ' + (error?.message || ''));
  }
};

/**
 * PUT /api/tasks/:id
 * Update an existing task
 */
const editTask = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Task id is required');
    }

    const { task, taskDate, isDoneTask, priority, gmailId } = req.body;

    // Check if task exists and belongs to user
    const existingTask = await prisma.task.findUnique({
      where: { id },
    });

    if (!existingTask) {
      return fail(res, 404, 'Task not found');
    }

    if (existingTask.userId !== user.id) {
      return fail(res, 403, 'Forbidden: You can only edit your own tasks');
    }

    const updateData = {};
    if (task !== undefined) updateData.task = task;
    if (taskDate !== undefined) updateData.taskDate = taskDate ? new Date(taskDate) : null;
    if (isDoneTask !== undefined) updateData.isDoneTask = isDoneTask;
    if (priority !== undefined) updateData.priority = priority;
    if (gmailId !== undefined) updateData.gmailId = gmailId;

    const updatedTask = await prisma.task.update({
      where: { id },
      data: updateData,
    });

    return ok(res, updatedTask, 'Task updated successfully');
  } catch (error) {
    console.error('Error updating task:', error);
    return fail(res, 500, 'Failed to update task: ' + (error?.message || ''));
  }
};

/**
 * GET /api/tasks
 * Get all tasks for the authenticated user
 */
const getAllTasks = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { gmailId, isDoneTask, priority, page = 1, limit = 10 } = req.query;

    const where = { userId: user.id };

    if (gmailId) where.gmailId = gmailId;
    if (isDoneTask !== undefined) where.isDoneTask = isDoneTask === 'true';
    if (priority) where.priority = priority;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [tasks, total] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.task.count({ where }),
    ]);

    return ok(res, tasks, 'Tasks fetched successfully', {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
    });
  } catch (error) {
    console.error('Error fetching tasks:', error);
    return fail(res, 500, 'Failed to fetch tasks: ' + (error?.message || ''));
  }
};

/**
 * GET /api/tasks/:id
 * Get a task by ID
 */
const getTaskById = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Task id is required');
    }

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return fail(res, 404, 'Task not found');
    }

    if (task.userId !== user.id) {
      return fail(res, 403, 'Forbidden: You can only view your own tasks');
    }

    return ok(res, task, 'Task fetched successfully');
  } catch (error) {
    console.error('Error fetching task:', error);
    return fail(res, 500, 'Failed to fetch task: ' + (error?.message || ''));
  }
};

/**
 * DELETE /api/tasks/:id
 * Delete a task
 */
const deleteTask = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Task id is required');
    }

    const task = await prisma.task.findUnique({
      where: { id },
    });

    if (!task) {
      return fail(res, 404, 'Task not found');
    }

    if (task.userId !== user.id) {
      return fail(res, 403, 'Forbidden: You can only delete your own tasks');
    }

    await prisma.task.delete({
      where: { id },
    });

    return ok(res, { id }, 'Task deleted successfully');
  } catch (error) {
    console.error('Error deleting task:', error);
    return fail(res, 500, 'Failed to delete task: ' + (error?.message || ''));
  }
};

/**
 * GET /api/tasks/gmail/:gmailId
 * Get all tasks for a specific Gmail ID
 */
const getTasksByGmailId = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { gmailId } = req.params;
    if (!gmailId) {
      return fail(res, 400, 'Gmail ID is required');
    }

    const { isDoneTask, priority, page = 1, limit = 10 } = req.query;

    const where = {
      userId: user.id,
      gmailId: gmailId,
    };

    if (isDoneTask !== undefined) where.isDoneTask = isDoneTask === 'true';
    if (priority) where.priority = priority;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const [tasks, total, pendingCount, doneCount] = await Promise.all([
      prisma.task.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limitNum,
      }),
      prisma.task.count({ where }),
      prisma.task.count({
        where: {
          userId: user.id,
          gmailId: gmailId,
          isDoneTask: false,
        },
      }),
      prisma.task.count({
        where: {
          userId: user.id,
          gmailId: gmailId,
          isDoneTask: true,
        },
      }),
    ]);

    return ok(res, tasks, 'Tasks fetched successfully', {
      total,
      page: pageNum,
      limit: limitNum,
      totalPages: Math.ceil(total / limitNum),
      gmailId,
      pendingTasks: pendingCount,
      doneTasks: doneCount,
    });
  } catch (error) {
    console.error('Error fetching tasks by Gmail ID:', error);
    return fail(res, 500, 'Failed to fetch tasks: ' + (error?.message || ''));
  }
};

module.exports = {
  addTask,
  editTask,
  getAllTasks,
  getTaskById,
  deleteTask,
  getTasksByGmailId,
};
