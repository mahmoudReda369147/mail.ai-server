const prisma = require('../config/database');
const { ok, fail } = require('../utils/response');
const { createCalendarEvent, updateCalendarEvent, deleteCalendarEvent } = require('../services/calendarService');

const addTask = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { title, description, dueDate, status, priority ,gmailId} = req.body;
    
    if (!title || !dueDate) {
      return fail(res, 400, 'Required fields: title, dueDate');
    }

    // Validate dueDate is a valid date
    const parsedDueDate = new Date(dueDate);
    if (isNaN(parsedDueDate.getTime())) {
      return fail(res, 400, 'Invalid dueDate format');
    }

    // Validate status if provided
    const validStatuses = ['pending', 'completed', 'cancelled'];
    const taskStatus = status || 'pending';
    if (status && !validStatuses.includes(status)) {
      return fail(res, 400, 'Invalid status. Must be: pending, completed, or cancelled');
    }

    // Validate priority if provided
    const validPriorities = ['low', 'medium', 'high'];
    const taskPriority = priority || 'medium';
    if (priority && !validPriorities.includes(priority)) {
      return fail(res, 400, 'Invalid priority. Must be: low, medium, or high');
    }

    // Create event in Google Calendar first
    let googleEventId = null;
    try {
      const googleEvent = await createCalendarEvent(user.id, {
        title,
        description,
        dueDate: parsedDueDate,
        priority: taskPriority
      });
      googleEventId = googleEvent.id;
    } catch (calendarError) {
      console.error('Error creating Google Calendar event:', calendarError);
      // Continue with database creation even if Google Calendar fails
      // This ensures the task is still saved locally
    }

    // Create calendar task in database
    const task = await prisma.calendarTask.create({
      data: {
        title: title,
        description: description || null,
        dueDate: parsedDueDate,
        status: taskStatus,
        priority: taskPriority,
        userId: user.id,
        googleEventId: googleEventId,
        gmailId
      }
    });

    return ok(res, task, googleEventId
      ? 'Task added successfully to database and Google Calendar'
      : 'Task added to database (Google Calendar sync failed)');
  } catch (error) {
    console.error('Error adding task:', error);
    return fail(res, 500, 'Failed to add task: ' + (error?.message || ''));
  }
};

const getTasks = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { status, priority, from, to ,search,page,limit} = req.query;

    // Build where clause
    let whereClause = {
      userId: user.id
    };

    if (status) {
      whereClause.status = status;
    }

    if (priority) {
      whereClause.priority = priority;
    }

    if (from || to) {
      whereClause.dueDate = {};
      if (from) {
        whereClause.dueDate.gte = new Date(from);
      }
      if (to) {
        whereClause.dueDate.lte = new Date(to);
      }
    }

    if (search && typeof search === 'string' && search.trim()) {
      whereClause.title = { contains: search.trim(), mode: 'insensitive' };
    }
    const pageNum = parseInt(page, 9);
    const limitNum = parseInt(limit, 9);
    const skip = (pageNum - 1) * limitNum;
    const tasks = await prisma.calendarTask.findMany({
      where: whereClause,
      orderBy: {
        dueDate: 'asc'
      },
      skip,
      take: limitNum,
    });
    const total = await prisma.calendarTask.count({ where: whereClause });

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

const getTaskById = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Task ID is required');
    }

    const task = await prisma.calendarTask.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });

    if (!task) {
      return fail(res, 404, 'Task not found');
    }

    return ok(res, task, 'Task fetched successfully');
  } catch (error) {
    console.error('Error fetching task:', error);
    return fail(res, 500, 'Failed to fetch task: ' + (error?.message || ''));
  }
};

const updateTask = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Task ID is required');
    }

    const { title, description, dueDate, status, priority } = req.body;

    // Check if task exists and belongs to user
    const existingTask = await prisma.calendarTask.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });

    if (!existingTask) {
      return fail(res, 404, 'Task not found');
    }

    // Validate dueDate if provided
    let parsedDueDate;
    if (dueDate) {
      parsedDueDate = new Date(dueDate);
      if (isNaN(parsedDueDate.getTime())) {
        return fail(res, 400, 'Invalid dueDate format');
      }
    }

    // Validate status if provided
    if (status) {
      const validStatuses = ['pending', 'completed', 'cancelled'];
      if (!validStatuses.includes(status)) {
        return fail(res, 400, 'Invalid status. Must be: pending, completed, or cancelled');
      }
    }

    // Validate priority if provided
    if (priority) {
      const validPriorities = ['low', 'medium', 'high'];
      if (!validPriorities.includes(priority)) {
        return fail(res, 400, 'Invalid priority. Must be: low, medium, or high');
      }
    }

    // Update Google Calendar event if it exists
    if (existingTask.googleEventId && (title || description || dueDate || priority)) {
      try {
        await updateCalendarEvent(user.id, existingTask.googleEventId, {
          title: title || existingTask.title,
          description: description !== undefined ? description : existingTask.description,
          dueDate: dueDate ? parsedDueDate : existingTask.dueDate,
          priority: priority ? priority : existingTask.priority
        });
      } catch (calendarError) {
        console.error('Error updating Google Calendar event:', calendarError);
        // Continue with database update even if Google Calendar fails
      }
    }

    // Update task in database
    const updatedTask = await prisma.calendarTask.update({
      where: {
        id: id
      },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(dueDate && { dueDate: parsedDueDate }),
        ...(status && { status }),
        ...(priority && { priority })
      }
    });

    return ok(res, updatedTask, 'Task updated successfully');
  } catch (error) {
    console.error('Error updating task:', error);
    return fail(res, 500, 'Failed to update task: ' + (error?.message || ''));
  }
};

const deleteTask = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Task ID is required');
    }

    // Check if task exists and belongs to user
    const existingTask = await prisma.calendarTask.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });

    if (!existingTask) {
      return fail(res, 404, 'Task not found');
    }

    // Delete from Google Calendar if event exists
    if (existingTask.googleEventId) {
      try {
        await deleteCalendarEvent(user.id, existingTask.googleEventId);
      } catch (calendarError) {
        console.error('Error deleting Google Calendar event:', calendarError);
        // Continue with database deletion even if Google Calendar fails
      }
    }

    // Delete task from database
    await prisma.calendarTask.delete({
      where: {
        id: id
      }
    });

    return ok(res, { id }, 'Task deleted successfully');
  } catch (error) {
    console.error('Error deleting task:', error);
    return fail(res, 500, 'Failed to delete task: ' + (error?.message || ''));
  }
};

module.exports = {
  addTask,
  getTasks,
  getTaskById,
  updateTask,
  deleteTask
};
