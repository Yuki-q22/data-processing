const { chromium } = require('C:\\Users\\Yuki\\.cache\\codex-runtimes\\codex-primary-runtime\\dependencies\\node\\node_modules\\playwright')

async function main() {
  const browser = await chromium.launch({
    executablePath: 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    headless: true,
  })

  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
  const errors = []
  page.on('console', (message) => {
    if (message.type() === 'error') errors.push(message.text())
  })
  page.on('pageerror', (error) => errors.push(error.message))

  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.getByRole('heading', { name: /让每一份招生数据/ }).waitFor()
  await page.getByRole('button', { name: /开始智能填充/ }).click()
  await page.getByRole('heading', { name: '专业分模板智能填充', exact: true }).waitFor()
  await page.getByRole('button', { name: /工作台概览/ }).click()
  await page.getByRole('heading', { name: /让每一份招生数据/ }).waitFor()

  await page.setViewportSize({ width: 390, height: 844 })
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: /规则中心/ }).click()
  await page.getByRole('heading', { name: '规则中心', exact: true }).waitFor()

  await page.getByRole('button', { name: '打开导航' }).click()
  await page.getByRole('button', { name: /工作台概览/ }).click()
<<<<<<< ours
<<<<<<< ours
=======
  await page.waitForTimeout(350)
>>>>>>> theirs
=======
  await page.waitForTimeout(350)
>>>>>>> theirs
  await page.screenshot({
    path: 'output/playwright/dashboard-mobile.png',
    fullPage: true,
  })

  console.log(JSON.stringify({
    desktopQuickLaunch: 'ok',
    mobileNavigation: 'ok',
    runtimeErrors: errors,
  }, null, 2))

  await browser.close()
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
