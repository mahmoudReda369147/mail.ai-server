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
const calendarRoute = require('./routes/calendar.route');
const taskRoute = require('./routes/task.route');
const webhooksRoute = require('./routes/webhooks');
const botsRoute = require('./routes/bots.route');
const pdfRoute = require('./routes/pdf.route');


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
app.use("/api/templates", templetsRoute);
app.use("/api/calendar", calendarRoute);
app.use("/api/tasks", taskRoute);
app.use("/api/webhooks", webhooksRoute);
app.use("/api/bots", botsRoute);
app.use("/api/pdf", pdfRoute);


// Start server
const PORT = config.PORT || 8080;
 app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

module.exports = app;
