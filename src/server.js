// src/server.js
const express = require('express');
const cors = require('cors');
const config = require('./config/config');
const {google} = require('googleapis');
const dotenv = require('dotenv');
dotenv.config();
const prisma = require('./config/database');
const authRoute = require('./routes/auth.route');
const gmailRoute = require('./routes/gmail.route');
// Initialize Express app
const app = express();

// Middleware
app.use(cors()); // Enable CORS for all routes
app.use(express.json());

// بيانات OAuth من Google Cloud

app.use("/api/auth", authRoute);
app.use("/api/gmail", gmailRoute);

// Start server
const PORT = config.PORT || 3000;
 app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
