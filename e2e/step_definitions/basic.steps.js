'use strict';

const { Before, Given, Then, After } = require('@cucumber/cucumber');
const assert = require('assert');

Before(async function () {
  this.browser = browser;
});

After(async function () {
  // Attach a screenshot to every scenario so it appears in the Cucumber HTML report
  try {
    const shot = await browser.takeScreenshot();
    await this.attach(shot, 'image/png');
  } catch (_) {}
});

Given('I go to {string}', async function (path) {
  await browser.navigateTo(browser.launchUrl + path);
  await browser.waitForElementVisible('body', 5000);
});

Then('the page title is {string}', async function (expectedTitle) {
  const title = await browser.getTitle();
  assert.strictEqual(title, expectedTitle, `Expected title "${expectedTitle}" but got "${title}"`);
});

Then('I see the navigation bar', async function () {
  await browser.waitForElementVisible('nav', 5000);
  const nav = await browser.findElement('css selector', 'nav');
  assert.ok(nav, 'Navigation bar must be present');
});

Then('the navigation contains {string}', async function (linkText) {
  const navText = await browser.execute(() => document.querySelector('nav')?.innerText ?? '');
  assert.ok(navText.includes(linkText), `Expected navigation to contain "${linkText}"`);
});

Then('the skip link is present', async function () {
  const skip = await browser.findElement('css selector', 'a.skip');
  assert.ok(skip, 'Skip link with class .skip must be present');
});

Then('the footer contains a link to the page source', async function () {
  const link = await browser.findElement(
    'css selector',
    'a[href*="github.com/hugmesh"]',
  );
  assert.ok(link, 'Footer must contain a GitHub source link');
});
