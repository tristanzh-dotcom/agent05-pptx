import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { chromium } from 'playwright'

const BASE_URL = process.env.AGENT05_E2E_URL ?? 'http://127.0.0.1:3000/agent05/index.html'
const DEFAULT_REFERENCE_FILE = '/var/folders/by/ryk2x0p133n0q7syh20tp2l40000gn/T/codex-clipboard-87dbfc5c-66aa-4e44-93ea-fe2e1d9b162b.png'
const ARTIFACT_DIR = process.env.AGENT05_E2E_ARTIFACT_DIR ?? path.join(os.tmpdir(), 'agent05-e2e')

function log(step, detail = {}) {
  console.log(JSON.stringify({ step, ...detail }))
}

function ensureReferenceFile() {
  const requested = process.env.AGENT05_REFERENCE_FILE ?? DEFAULT_REFERENCE_FILE
  if (fs.existsSync(requested)) return requested

  const fallbackPath = path.join(os.tmpdir(), 'agent05-e2e-reference.png')
  const transparentPng = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0kAAAAFklEQVR4nGP8//8/AzGAiYGBgYGBAQBXmAX9aS2iNQAAAABJRU5ErkJggg==',
    'base64'
  )
  fs.writeFileSync(fallbackPath, transparentPng)
  return fallbackPath
}

async function clickIfPresent(page, role, name) {
  const control = page.getByRole(role, { name })
  if ((await control.count()) === 1) {
    await control.click()
    return true
  }
  return false
}

const referenceFile = ensureReferenceFile()
fs.mkdirSync(ARTIFACT_DIR, { recursive: true })
const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
const browserMessages = []

page.on('console', (message) => {
  browserMessages.push({ type: message.type(), text: message.text() })
})
page.on('pageerror', (error) => {
  browserMessages.push({ type: 'pageerror', text: error.message })
})
page.on('requestfailed', (request) => {
  browserMessages.push({
    type: 'requestfailed',
    text: `${request.method()} ${request.url()} ${request.failure()?.errorText ?? ''}`.trim()
  })
})

try {
  log('goto', { baseUrl: BASE_URL })
  await page.goto(BASE_URL, { waitUntil: 'networkidle' })
  await clickIfPresent(page, 'button', '新建 PPT')

  log('upload.reference', { referenceFile })
  await page.setInputFiles('input[aria-label="上传参考文件"]', referenceFile)
  await page.getByText('图片参考').waitFor({ timeout: 60_000 })
  await page.locator('[data-testid="inline-reference-color-swatch"]').first().waitFor({ timeout: 60_000 })

  log('prompt.fill')
  await page.getByLabel('Prompt').fill(
    [
      '生成一个5页的PPT，风格参考上传的png的图片颜色风格。',
      "这个是一个org chart相关的ppt。",
      "第一页抬头栏中是'JLR org status today'。",
      "第二页抬头中写'org proposal'。",
      '之后三页目前空着。之后加入新的内容。'
    ].join('\n')
  )
  await page.getByLabel('页面').selectOption('5')

  log('generate.click')
  await page.getByRole('button', { name: 'Generate PPT' }).click()
  log('template.wait')
  await page.getByLabel('模板选择').waitFor({ timeout: 180_000 })

  const promptBox = await page.getByLabel('Prompt').boundingBox()
  const templateBox = await page.getByLabel('模板选择').boundingBox()
  if (!promptBox || !templateBox) {
    throw new Error('Unable to measure template selection and prompt positions')
  }
  if (templateBox.y >= promptBox.y) {
    throw new Error(`Template selection is not above Prompt: template y=${templateBox.y}, prompt y=${promptBox.y}`)
  }

  log('template.select', { templateY: templateBox.y, promptY: promptBox.y })
  await page.getByRole('button', { name: /选择/ }).first().click()
  log('result.wait')
  const errorLocator = page.locator('text=/opencode|build_pptx|selected_slides|failed|失败|错误|timed out|invalid/i')
  const outcome = await Promise.race([
    page.getByText('Result').waitFor({ timeout: 600_000 }).then(() => ({ type: 'result' })),
    errorLocator.waitFor({ timeout: 600_000 }).then(() => ({ type: 'error' }))
  ])
  if (outcome.type === 'error') {
    throw new Error(await errorLocator.innerText({ timeout: 5_000 }))
  }
  await page.getByRole('link', { name: '下载 .pptx' }).waitFor({ timeout: 60_000 })
  await page.locator('iframe[title="PPT 成品预览"]').waitFor({ timeout: 60_000 })

  const downloadHref = await page.getByRole('link', { name: '下载 .pptx' }).getAttribute('href')
  console.log(
    JSON.stringify(
      {
        status: 'passed',
        baseUrl: BASE_URL,
        referenceFile,
        downloadHref,
        templateY: templateBox.y,
        promptY: promptBox.y
      },
      null,
      2
    )
  )
} catch (error) {
  const screenshotPath = path.join(ARTIFACT_DIR, `failure-${Date.now()}.png`)
  await page.screenshot({ path: screenshotPath, fullPage: true }).catch(() => {})
  const visibleText = await page.locator('body').innerText({ timeout: 5_000 }).catch((innerError) => `body read failed: ${innerError.message}`)
  console.error(
    JSON.stringify(
      {
        status: 'failed',
        message: error instanceof Error ? error.message : String(error),
        screenshotPath,
        visibleText: visibleText.slice(0, 4000),
        browserMessages: browserMessages.slice(-50)
      },
      null,
      2
    )
  )
  throw error
} finally {
  await browser.close()
}
