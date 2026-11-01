// Capture du site en ligne + rendu des scènes en PNG 1920x1080 (Playwright)
const { chromium } = require('playwright');
const SITE = 'https://khoule-education.vercel.app';
(async () => {
  const browser = await chromium.launch();
  const desk = await browser.newPage({ viewport: { width: 1440, height: 860 }, deviceScaleFactor: 1.5 });
  await desk.goto(SITE + '/', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(1500);
  await desk.screenshot({ path: 'shots/landing.png' });
  await desk.goto(SITE + '/inscription', { waitUntil: 'networkidle' });
  await desk.waitForTimeout(1500);
  await desk.screenshot({ path: 'shots/register.png' });
  const mob = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  await mob.goto(SITE + '/', { waitUntil: 'networkidle' });
  await mob.waitForTimeout(1500);
  await mob.screenshot({ path: 'shots/mobile.png' });
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  for (let s = 1; s <= 13; s++) {
    await page.goto(`file://${process.cwd()}/scenes.html?s=${s}`, { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    await page.screenshot({ path: `frames/scene${String(s).padStart(2, '0')}.png` });
  }
  await browser.close();
  console.log('captures OK');
})();
