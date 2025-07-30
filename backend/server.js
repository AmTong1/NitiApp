const express = require('express');
const fs = require('fs-extra');
const path = require('path');
const puppeteer = require('puppeteer');
const Handlebars = require('handlebars');
const cors = require('cors');

const app = express();
app.use(express.json());
app.use(cors());
app.use('/pdfs', express.static(path.join(__dirname, 'pdfs')));

app.post('/generate-pdf', async (req, res) => {
  const data = req.body;

  // สร้างโฟลเดอร์ pdfs ถ้ายังไม่มี
  await fs.ensureDir(path.join(__dirname, 'pdfs'));

  const templateHtml = await fs.readFile('./receipt-template.html', 'utf8');
  const template = Handlebars.compile(templateHtml);
  const html = template(data);

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setContent(html, { waitUntil: 'networkidle0' });

  const filename = `receipt-${Date.now()}.pdf`;
  const filePath = path.join(__dirname, 'pdfs', filename);
  await page.pdf({
    path: filePath,
    format: 'A4',
    printBackground: true,
    preferCSSPageSize: true,
    margin: { top: '10mm', bottom: '10mm', left: '10mm', right: '10mm' }
  });
  await browser.close();

  res.json({ url: `http://192.168.2.12:3000/pdfs/${filename}` });
});

app.listen(3000, () => {
  console.log('PDF server running on port 3000');
});
