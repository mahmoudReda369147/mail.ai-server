const prisma = require('../config/database');
const agent = require('../services/agent');
const { ok, fail } = require('../utils/response');

const createTemplate = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { name, subject, body, categure } = req.body;
    
    if (!name || !subject || !body) {
      return fail(res, 400, 'Required fields: name, subject, body');
    }

    // Create template in database with new schema
    const template = await prisma.templete.create({
      data: {
        name: name,
        subject: subject,
        body: body, // HTML body as string
        categure: categure || 'general',
        usedtimes: 0,
        isFavorets: false
      }
    });

    return ok(res, template, 'Template created successfully');
  } catch (error) {
    console.error('Error creating template:', error);
    return fail(res, 500, 'Failed to create template: ' + (error?.message || ''));
  }
};

const createCategory = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { Name } = req.body;
    
    if (!Name) {
      return fail(res, 400, 'Required field: Name');
    }

    const category = await prisma.templateCategory.create({
      data: {
        Name: Name,
        userId: user.id
      }
    });

    return ok(res, category, 'Category created successfully');
  } catch (error) {
    console.error('Error creating category:', error);
    return fail(res, 500, 'Failed to create category: ' + (error?.message || ''));
  }
};

const getCategoriesByUserId = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const categories = await prisma.templateCategory.findMany({
      where: {
        userId: user.id
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    return ok(res, categories, 'Categories fetched successfully');
  } catch (error) {
    console.error('Error fetching categories:', error);
    return fail(res, 500, 'Failed to fetch categories: ' + (error?.message || ''));
  }
};

const getTemplatesByUser = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const templates = await prisma.templete.findMany({
      orderBy: {
        createdAt: 'desc'
      }
    });

    return ok(res, templates, 'Templates fetched successfully');
  } catch (error) {
    console.error('Error fetching templates:', error);
    return fail(res, 500, 'Failed to fetch templates: ' + (error?.message || ''));
  }
};

const getTemplateById = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Template ID is required');
    }

    const template = await prisma.templete.findUnique({
      where: {
        id: id
      }
    });

    if (!template) {
      return fail(res, 404, 'Template not found');
    }

    return ok(res, template, 'Template fetched successfully');
  } catch (error) {
    console.error('Error fetching template:', error);
    return fail(res, 500, 'Failed to fetch template: ' + (error?.message || ''));
  }
};

const updateTemplateById = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Template ID is required');
    }

    const { name, subject, body, categure, isFavorets } = req.body;

    // Check if template exists
    const existingTemplate = await prisma.templete.findUnique({
      where: {
        id: id
      }
    });

    if (!existingTemplate) {
      return fail(res, 404, 'Template not found');
    }

    // Update template
    const updatedTemplate = await prisma.templete.update({
      where: {
        id: id
      },
      data: {
        ...(name && { name }),
        ...(subject && { subject }),
        ...(body && { body }),
        ...(categure !== undefined && { categure }),
        ...(isFavorets !== undefined && { isFavorets })
      }
    });

    return ok(res, updatedTemplate, 'Template updated successfully');
  } catch (error) {
    console.error('Error updating template:', error);
    return fail(res, 500, 'Failed to update template: ' + (error?.message || ''));
  }
};

const deleteTemplateById = async (req, res) => {
  try {
    const user = req.user;
    if (!user) {
      return fail(res, 401, 'Unauthorized');
    }

    const { id } = req.params;
    if (!id) {
      return fail(res, 400, 'Template ID is required');
    }

    // Check if template exists
    const existingTemplate = await prisma.templete.findUnique({
      where: {
        id: id
      }
    });

    if (!existingTemplate) {
      return fail(res, 404, 'Template not found');
    }

    // Delete template
    await prisma.templete.delete({
      where: {
        id: id
      }
    });

    return ok(res, { id }, 'Template deleted successfully');
  } catch (error) {
    console.error('Error deleting template:', error);
    return fail(res, 500, 'Failed to delete template: ' + (error?.message || ''));
  }
};

module.exports = { 
  createTemplate, 
  createCategory, 
  getCategoriesByUserId, 
  getTemplatesByUser,
  getTemplateById,
  updateTemplateById,
  deleteTemplateById
};