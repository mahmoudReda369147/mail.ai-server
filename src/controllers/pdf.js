const express = require('express');
const puppeteer = require('puppeteer');
const { uploadToS3 } = require('../services/s3Service'); // adjust path if needed

const router = express.Router();

const uploadPdf = async (req, res) => {
  try {
    const { html } = req.body;

    if (!html || typeof html !== 'string') {
      return res.status(400).json({
        success: false,
        message: 'html is required and must be a string'
      });
    }

    // Launch browser
    const browser = await puppeteer.launch({
      headless: 'new',
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();

    // Set HTML content
    await page.setContent(html, {
      waitUntil: 'networkidle0'
    });

    // Generate PDF buffer
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true
    });

    await browser.close();

    // Generate file name
    const fileName = `pdfs/${Date.now()}.pdf`;

    // Upload to S3
    const pdfUrl = await uploadToS3(
      pdfBuffer,
      fileName,
      'application/pdf'
    );

    return res.status(200).json({
      success: true,
      url: pdfUrl
    });

  } catch (error) {
    console.error(error);
    return res.status(500).json({
      success: false,
      message: error.message
    });
  }
};

module.exports = { uploadPdf };
