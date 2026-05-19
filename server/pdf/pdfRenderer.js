import puppeteer from 'puppeteer';

let browserPromise = null;

const getBrowser = async () => {
  if (!browserPromise) {
    browserPromise = puppeteer.launch({
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
      headless: 'new',
    });
  }
  return browserPromise;
};

export const renderPdfFromHtml = async (html, options = {}) => {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Match A4 dimensions at 96 dpi (210mm × 297mm) so CSS px values map
    // exactly to the paper size — prevents the subtle ~0.8 % scale mismatch
    // that occurs when the default 800 px viewport is wider than A4 (793.7 px).
    await page.setViewport({ width: 794, height: 1123, deviceScaleFactor: 1 });
    await page.setContent(html, { waitUntil: 'networkidle2', timeout: 30000 });
    if (options.media === 'screen' || options.media === 'print') {
      await page.emulateMediaType(options.media);
    }
    const pdfOptions = {
      format: options.format || 'A4',
      printBackground: true,
    };
    if (options.margin) {
      pdfOptions.margin = options.margin;
    }
    if (options.displayHeaderFooter) {
      pdfOptions.displayHeaderFooter = true;
      pdfOptions.headerTemplate = typeof options.headerTemplate === 'string'
        ? options.headerTemplate
        : '<div></div>';
      pdfOptions.footerTemplate = typeof options.footerTemplate === 'string'
        ? options.footerTemplate
        : '<div></div>';
    }
    const pdf = await page.pdf(pdfOptions);
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
};

export const closePdfBrowser = async () => {
  if (!browserPromise) return;
  const browser = await browserPromise;
  await browser.close();
  browserPromise = null;
};
