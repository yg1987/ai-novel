import { mkdir } from 'node:fs/promises'
import { chromium } from 'playwright'

const outputDir = '.artifacts/material-phase3'
const longMaterialTitle = '这是一个非常长的素材标题用于确认列表文本不会越过中间栏边界并遮挡其他内容'
await mkdir(outputDir, { recursive: true })

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const consoleErrors = []
const pageErrors = []
page.on('console', (message) => {
  if (message.type() === 'error') consoleErrors.push(message.text())
})
page.on('pageerror', (error) => { pageErrors.push(error.message) })

await page.addInitScript(() => {
  const projectId = '11111111-1111-4111-8111-111111111111'
  const kindId = '22222222-2222-4222-8222-222222222222'
  const categoryId = '33333333-3333-4333-8333-333333333333'
  const documentId = '44444444-4444-4444-8444-444444444444'
  const attachmentId = '88888888-8888-4888-8888-888888888888'
  const sections = Array.from({ length: 120 }, (_, index) => ({
    id: `55555555-5555-4555-8555-${String(index).padStart(12, '0')}`,
    documentId,
    order: index,
    title: `第 ${index + 1} 章 这是用于验证超长目录标题不会挤压正文区域的章节名称`,
    relativePath: `documents/sections/${documentId}/${index}.txt`,
    characterCount: 1800 + index,
  }))
  const project = {
    id: projectId,
    name: 'UI 验收项目',
    genre: '长篇小说',
    description: '第三阶段素材库桌面与窄窗口布局验收',
    target_words: 300000,
    status: '进行中',
    created_at: '2026-07-20T00:00:00Z',
    updated_at: '2026-07-20T00:00:00Z',
  }
  const materialItems = Array.from({ length: 36 }, (_, index) => ({
    id: `66666666-6666-4666-8666-${String(index).padStart(12, '0')}`,
    title: index === 0 ? '这是一个非常长的素材标题用于确认列表文本不会越过中间栏边界并遮挡其他内容' : `素材 ${index + 1}`,
    kindId,
    categoryId,
    summary: `摘要 ${index + 1}`,
    contentPreview: '用于布局检查的素材正文预览。',
    sourceName: '测试来源',
    tags: ['长篇', '参考'],
    scope: 'projects',
    projectIds: [projectId],
    favorite: index % 4 === 0,
    updatedAt: '2026-07-20T00:00:00Z',
  }))
  const imageMaterial = {
    schemaVersion: 1,
    ...materialItems[0],
    content: '用于人物外形与服装细节参考的图片说明。',
    contentFormat: 'plain_text',
    summary: '已保存图片附件重新打开验收',
    sourceType: 'image',
    sourceUrl: '',
    attachmentIds: [attachmentId],
    createdAt: '2026-07-20T00:00:00Z',
  }
  const pngBytes = Array.from(Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='), (character) => character.charCodeAt(0)))
  const previewSections = Array.from({ length: 36 }, (_, index) => ({
    order: index,
    title: `第${index + 1}章 导入确认标题`,
    characterCount: 2200 + index,
    contentPreview: '章节正文片段，用于确认预览列表可以独立滚动并保持底部操作区可见。',
  }))

  const invoke = async (command, args = {}) => {
    switch (command) {
      case 'list_projects': return [project]
      case 'initialize_material_library': return { cleanedProjects: 0, skippedProjects: 1 }
      case 'list_material_categories': return [{ id: categoryId, name: '收件箱', parentId: null, order: 0, systemKey: 'inbox' }]
      case 'list_material_kinds': return [{ id: kindId, name: '知识资料', order: 0, presetKey: 'knowledge', archived: false }]
      case 'list_materials': return { items: materialItems.slice(0, 20), page: 1, pageSize: 20, totalItems: materialItems.length, totalPages: 2 }
      case 'get_material': return imageMaterial
      case 'get_material_plain_text': return imageMaterial.content
      case 'list_material_usages': return []
      case 'list_material_image_attachments': return [{ id: attachmentId, materialId: imageMaterial.id, originalName: 'reference.png', mimeType: 'image/png', size: pngBytes.length, relativePath: `attachments/materials/${imageMaterial.id}/${attachmentId}.png`, createdAt: '2026-07-20T00:00:00Z' }]
      case 'read_material_image_attachment': return { attachment: { id: attachmentId, materialId: imageMaterial.id, originalName: 'reference.png', mimeType: 'image/png', size: pngBytes.length, relativePath: `attachments/materials/${imageMaterial.id}/${attachmentId}.png`, createdAt: '2026-07-20T00:00:00Z' }, bytes: pngBytes }
      case 'list_material_documents': return {
        items: [{ id: documentId, title: '真实长篇资料与超长书名布局检查', author: '测试作者', format: 'epub', scope: 'projects', projectIds: [projectId], sectionCount: sections.length, updatedAt: '2026-07-20T00:00:00Z' }],
        page: 1,
        pageSize: 20,
        totalItems: 1,
        totalPages: 1,
      }
      case 'get_material_document': return {
        document: { schemaVersion: 1, id: documentId, title: '真实长篇资料与超长书名布局检查', author: '测试作者', format: 'epub', attachmentId: '77777777-7777-4777-8777-777777777777', scope: 'projects', projectIds: [projectId], sectionIds: sections.map((section) => section.id), createdAt: '2026-07-20T00:00:00Z', updatedAt: '2026-07-20T00:00:00Z' },
        sections,
      }
      case 'read_material_document_section': {
        const section = sections.find((candidate) => candidate.id === args.sectionId) ?? sections[0]
        return { document: { id: documentId }, section, content: `${section.title}\n\n${'长篇正文内容用于检查阅读区独立滚动。'.repeat(180)}` }
      }
      case 'search_material_document_sections': return []
      case 'preview_material_document_import': return {
        fileName: 'mock-novel.txt',
        format: 'txt',
        title: '待导入长篇小说',
        author: '',
        detectedEncoding: 'GB18030 / GBK',
        sections: previewSections,
      }
      case 'list_chapters': return []
      case 'load_project_meta': return null
      case 'read_project_file': return ''
      default:
        if (command.includes('dialog') && command.endsWith('|open')) return 'C:\\fixtures\\mock-novel.txt'
        if (command.startsWith('list_')) return []
        return null
    }
  }
  window.__TAURI_INTERNALS__ = {
    invoke,
    convertFileSrc: (path) => path,
    transformCallback: () => 1,
    unregisterCallback: () => {},
  }
})

const assertNoPageOverflow = async (label) => {
  const metrics = await page.evaluate(() => ({
    width: window.innerWidth,
    bodyWidth: document.body.scrollWidth,
    height: window.innerHeight,
    bodyHeight: document.body.scrollHeight,
  }))
  if (metrics.bodyWidth > metrics.width + 1 || metrics.bodyHeight > metrics.height + 1) {
    throw new Error(`${label} overflowed viewport: ${JSON.stringify(metrics)}`)
  }
}

await page.goto('http://127.0.0.1:1420', { waitUntil: 'networkidle' })
await page.getByText('UI 验收项目', { exact: true }).first().click()
await page.getByRole('button', { name: /素材/ }).click()
await page.locator('.material-workspace').waitFor()
await assertNoPageOverflow('material desktop')
await page.screenshot({ path: `${outputDir}/materials-desktop.png`, fullPage: true })
await page.getByText(longMaterialTitle, { exact: true }).click()
await page.locator('.material-image-list img').waitFor()
await page.screenshot({ path: `${outputDir}/image-detail-desktop.png`, fullPage: true })

await page.getByRole('button', { name: /资料源/ }).click()
await page.getByText('真实长篇资料与超长书名布局检查', { exact: true }).click()
await page.locator('.material-document-toc button').last().scrollIntoViewIfNeeded()
const tocMetrics = await page.locator('.material-document-toc').evaluate((element) => ({
  scrollHeight: element.scrollHeight,
  clientHeight: element.clientHeight,
}))
if (tocMetrics.scrollHeight <= tocMetrics.clientHeight) throw new Error('Long document TOC is not independently scrollable')
await assertNoPageOverflow('document desktop')
await page.screenshot({ path: `${outputDir}/documents-desktop.png`, fullPage: true })

await page.getByRole('button', { name: '导入 TXT / EPUB' }).click()
await page.getByRole('button', { name: '选择 TXT 或 EPUB' }).click()
await page.getByText('GB18030 / GBK', { exact: true }).waitFor()
await page.getByRole('button', { name: '单篇长文本' }).click()
await page.getByText(/将全文作为一个连续章节导入/).waitFor()
await page.getByRole('button', { name: '按识别章节' }).click()
const previewScroll = await page.locator('.material-document-preview-sections').evaluate((element) => ({
  scrollHeight: element.scrollHeight,
  clientHeight: element.clientHeight,
}))
if (previewScroll.scrollHeight <= previewScroll.clientHeight) throw new Error('TXT chapter preview is not independently scrollable')
await page.screenshot({ path: `${outputDir}/txt-import-desktop.png`, fullPage: true })

for (const viewport of [{ width: 760, height: 720 }, { width: 480, height: 780 }]) {
  await page.setViewportSize(viewport)
  await assertNoPageOverflow(`TXT import ${viewport.width}px`)
  const modal = await page.locator('.modal-content').boundingBox()
  if (!modal || modal.x < 0 || modal.y < 0 || modal.x + modal.width > viewport.width + 1 || modal.y + modal.height > viewport.height + 1) {
    throw new Error(`Modal escapes ${viewport.width}px viewport: ${JSON.stringify(modal)}`)
  }
  await page.screenshot({ path: `${outputDir}/txt-import-${viewport.width}.png`, fullPage: true })
}

await page.getByRole('button', { name: '取消' }).last().click()
await assertNoPageOverflow('document narrow')
const narrowDetailWidth = await page.locator('.material-document-detail-pane').evaluate((element) => element.getBoundingClientRect().width)
if (narrowDetailWidth < 470) throw new Error(`Narrow detail did not take the viewport: ${narrowDetailWidth}px`)
await page.screenshot({ path: `${outputDir}/documents-480.png`, fullPage: true })
await page.getByRole('button', { name: '← 返回资料列表' }).click()
if (await page.locator('.material-document-list-pane').evaluate((element) => getComputedStyle(element).display === 'none')) {
  throw new Error('Narrow back navigation did not restore the document list')
}
await page.screenshot({ path: `${outputDir}/documents-list-480.png`, fullPage: true })

await page.getByRole('button', { name: /全部素材/ }).click()
await page.getByText(longMaterialTitle, { exact: true }).click()
const imageLoaded = await page.locator('.material-image-list img').evaluate((image) => image.complete && image.naturalWidth > 0)
if (!imageLoaded) throw new Error('Stored image attachment did not render after reopening the material')
if (!(await page.getByRole('button', { name: '加入本章上下文' }).isDisabled())) {
  throw new Error('Image material AI-context action must remain disabled')
}
const materialDetailWidth = await page.locator('.material-detail-pane').evaluate((element) => element.getBoundingClientRect().width)
if (materialDetailWidth < 470) throw new Error(`Narrow material detail did not take the viewport: ${materialDetailWidth}px`)
await page.screenshot({ path: `${outputDir}/image-detail-480.png`, fullPage: true })
await page.getByRole('button', { name: '← 返回素材列表' }).click()

if (consoleErrors.length > 0 || pageErrors.length > 0) {
  throw new Error(`Runtime errors: ${JSON.stringify({ consoleErrors, pageErrors })}`)
}

await browser.close()
console.log(`Material phase 3 UI checks passed. Screenshots: ${outputDir}`)
