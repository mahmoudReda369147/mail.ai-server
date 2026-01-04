const prisma = require('../config/database');
const { ok, created, fail } = require('../utils/response');

/**
 * GET /api/bots
 * Get all bots for the authenticated user with pagination
 * Query params:
 * - page: Page number (default: 1)
 * - limit: Items per page (default: 10, max: 100)
 */
const getAllBots = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    // Parse pagination params
    const page = parseInt(req.query.page) || 1;
    const limit = Math.min(parseInt(req.query.limit) || 10, 100); // Max 100 items per page
    const skip = (page - 1) * limit;

    // Get total count for pagination metadata
    const totalCount = await prisma.bots.count({
      where: {
        userId: user.id
      }
    });

    // Get paginated bots
    const bots = await prisma.bots.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        createdAt: 'desc'
      },
      skip: skip,
      take: limit
    });

    // Calculate pagination metadata
    const totalPages = Math.ceil(totalCount / limit);
    const hasNextPage = page < totalPages;
    const hasPreviousPage = page > 1;

    return ok(res, bots, 'Bots fetched successfully', {
      pagination: {
        page,
        limit,
        totalCount,
        totalPages,
        hasNextPage,
        hasPreviousPage,
        count: bots.length
      }
    });
  } catch (error) {
    console.error('Error fetching bots:', error);
    return fail(res, 500, 'Failed to fetch bots: ' + (error?.message || ''));
  }
};

/**
 * GET /api/bots/:id
 * Get a specific bot by ID
 */
const getBotById = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Bot ID is required');
    }

    const bot = await prisma.bots.findFirst({
      where: {
        id: id,
        userId: user.id // Ensure user can only access their own bots
      }
    });

    if (!bot) {
      return fail(res, 404, 'Bot not found');
    }

    return ok(res, bot, 'Bot fetched successfully');
  } catch (error) {
    console.error('Error fetching bot:', error);
    return fail(res, 500, 'Failed to fetch bot: ' + (error?.message || ''));
  }
};

/**
 * POST /api/bots
 * Create a new bot
 */
const createBot = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const {
      emails,
      botName,
      isactive,
      replayTony,
      isAutoReply,
      userPrompet,
      isautoSummarize,
      isautoExtractTaskes,
      isautoExtractMettengs
    } = req.body;

    // Validate required fields
    if (!emails || !botName || !replayTony ) {
      return fail(res, 400, 'Required fields: emails, botName, replayTony');
    }

    // Validate replayTony enum
    const validTones = ['Professional', 'Friendly', 'Concise', 'Detailed'];
    if (!validTones.includes(replayTony)) {
      return fail(res, 400, `Invalid replayTony. Must be one of: ${validTones.join(', ')}`);
    }

    const bot = await prisma.bots.create({
      data: {
        emails,
        botName,
        userId: user.id,
        isactive: isactive !== undefined ? isactive : true,
        replayTony,
        isAutoReply: isAutoReply !== undefined ? isAutoReply : false,
        userPrompet,
        isautoSummarize: isautoSummarize !== undefined ? isautoSummarize : false,
        isautoExtractTaskes: isautoExtractTaskes !== undefined ? isautoExtractTaskes : false,
        isautoExtractMettengs: isautoExtractMettengs !== undefined ? isautoExtractMettengs : false
      }
    });

    return created(res, bot, 'Bot created successfully');
  } catch (error) {
    console.error('Error creating bot:', error);
    return fail(res, 500, 'Failed to create bot: ' + (error?.message || ''));
  }
};

/**
 * PUT /api/bots/:id
 * Update a bot by ID
 */
const updateBot = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Bot ID is required');
    }

    // Check if bot exists and belongs to user
    const existingBot = await prisma.bots.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });

    if (!existingBot) {
      return fail(res, 404, 'Bot not found');
    }

    const {
      emails,
      botName,
      isactive,
      replayTony,
      isAutoReply,
      userPrompet,
      isautoSummarize,
      isautoExtractTaskes,
      isautoExtractMettengs,
      templete
    } = req.body;

    // Validate replayTony if provided
    if (replayTony) {
      const validTones = ['Professional', 'Friendly', 'Concise', 'Detailed'];
      if (!validTones.includes(replayTony)) {
        return fail(res, 400, `Invalid replayTony. Must be one of: ${validTones.join(', ')}`);
      }
    }

    // Build update data object (only include provided fields)
    const updateData = {};
    if (emails !== undefined) updateData.emails = emails;
    if (botName !== undefined) updateData.botName = botName;
    if (isactive !== undefined) updateData.isactive = isactive;
    if (replayTony !== undefined) updateData.replayTony = replayTony;
    if (isAutoReply !== undefined) updateData.isAutoReply = isAutoReply;
    if (userPrompet !== undefined) updateData.userPrompet = userPrompet;
    if (isautoSummarize !== undefined) updateData.isautoSummarize = isautoSummarize;
    if (isautoExtractTaskes !== undefined) updateData.isautoExtractTaskes = isautoExtractTaskes;
    if (isautoExtractMettengs !== undefined) updateData.isautoExtractMettengs = isautoExtractMettengs;
    if (templete !== undefined) updateData.templete = templete;

    const updatedBot = await prisma.bots.update({
      where: { id: id },
      data: updateData
    });

    return ok(res, updatedBot, 'Bot updated successfully');
  } catch (error) {
    console.error('Error updating bot:', error);
    return fail(res, 500, 'Failed to update bot: ' + (error?.message || ''));
  }
};

/**
 * DELETE /api/bots/:id
 * Delete a bot by ID
 */
const deleteBot = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Bot ID is required');
    }

    // Check if bot exists and belongs to user
    const existingBot = await prisma.bots.findFirst({
      where: {
        id: id,
        userId: user.id
      }
    });

    if (!existingBot) {
      return fail(res, 404, 'Bot not found');
    }

    await prisma.bots.delete({
      where: { id: id }
    });

    return ok(res, { id }, 'Bot deleted successfully');
  } catch (error) {
    console.error('Error deleting bot:', error);
    return fail(res, 500, 'Failed to delete bot: ' + (error?.message || ''));
  }
};

module.exports = {
  getAllBots,
  getBotById,
  createBot,
  updateBot,
  deleteBot
};
