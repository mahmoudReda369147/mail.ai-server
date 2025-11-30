const router = require("express").Router();
const { login, callback } = require("../controllers/auth");

router.get("/login", login);
router.get("/oauth2callback", callback);
module.exports = router;
