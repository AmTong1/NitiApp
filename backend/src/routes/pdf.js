const path = require('path');
const fs = require('fs-extra');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const { HEADLESS_MODE, HOST, PORT, PUPPETEER_EXECUTABLE_PATH } = require('../config/env');
const { PDF_DIR, ROOT_DIR } = require('../config/paths');

function registerPdfRoutes(app) {
  app.post('/generate-pdf', async (req, res) => {
    try {
      const data = req.body;
      const templateHtml = await fs.readFile(path.join(ROOT_DIR, 'receipt-template.html'), 'utf8');
      const html = Handlebars.compile(templateHtml)(data);

      const launchOptions = { headless: HEADLESS_MODE };
      if (PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = PUPPETEER_EXECUTABLE_PATH;
        launchOptions.args = ['--no-sandbox', '--disable-setuid-sandbox'];
      }

      const browser = await puppeteer.launch(launchOptions);
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });

      const filename = `receipt-${Date.now()}.pdf`;
      const filePath = path.join(PDF_DIR, filename);

      await page.pdf({
        path: filePath,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
      });
      await browser.close();

      res.json({ url: `http://${HOST}:${PORT}/pdfs/${filename}` });
    } catch (err) {
      console.error(err);
      res.status(500).json({ message: 'สร้าง PDF ไม่สำเร็จ', error: err.message });
    }
  });
}

module.exports = { registerPdfRoutes };
