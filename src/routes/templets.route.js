const router = require('express').Router();
const { authMiddleware } = require('../middlewares/authMiddleware');
const { createTemplate, createCategory, getCategoriesByUserId, getTemplatesByUser, getTemplateById, updateTemplateById, deleteTemplateById } = require('../controllers/templets');

// POST /api/templates/create
router.post('/create', authMiddleware, createTemplate);

// POST /api/templates/category
router.post('/category', authMiddleware, createCategory);

// GET /api/templates/categories
router.get('/categories', authMiddleware, getCategoriesByUserId);

// GET /api/templates/user
router.get('/user', authMiddleware, getTemplatesByUser);

// GET /api/templates/:id
router.get('/:id', authMiddleware, getTemplateById);

// PUT /api/templates/:id
router.put('/:id', authMiddleware, updateTemplateById);

// DELETE /api/templates/:id
router.delete('/:id', authMiddleware, deleteTemplateById);

module.exports = router;