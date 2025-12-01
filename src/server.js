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
const templetsRoute = require('./routes/templets.route');
// Initialize Express app
const app = express();

// Middleware
app.use(cors({
  origin: [ 'http://localhost:3001', 'http://127.0.0.1:3001'],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());

// Routes
app.use("/api/auth", authRoute);
app.use("/api/gmail", gmailRoute);
app.use("/api/templets", templetsRoute);

// Start server
const PORT = config.PORT || 3000;
 app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
