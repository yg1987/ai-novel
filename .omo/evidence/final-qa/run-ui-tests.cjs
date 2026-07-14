// Playwright test script for Phase 2 foreshadow module UI tests
// Mocks Tauri APIs to test the React frontend in a browser

const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

const BASE_URL = 'http://localhost:1420';
const EVIDENCE_DIR = '.omo/evidence/final-qa';

// ─── Tauri Mock Script (injected as init script) ──────────────
// All data must be inline since it runs in browser context

const TAURI_MOCK_SCRIPT = `
(function() {
  const MOCK_PROJECT = {
    id: 'test-project-001',
    name: '测试小说',
    genre: '玄幻',
    description: '用于QA测试的项目',
    target_words: 100000,
    status: 'writing',
    created_at: '2024-01-01T00:00:00',
    updated_at: '2024-01-01T00:00:00',
  };

  const MOCK_CHAPTERS = [
    { id: 'ch001', title: '第1章 开端', volume: '第一卷', order: 1 },
    { id: 'ch002', title: '第2章 线索', volume: '第一卷', order: 2 },
    { id: 'ch003', title: '第3章 迷雾', volume: '第一卷', order: 3 },
    { id: 'ch004', title: '第4章 追踪', volume: '第一卷', order: 4 },
    { id: 'ch005', title: '第5章 真相', volume: '第一卷', order: 5 },
    { id: 'ch006', title: '第6章 对决', volume: '第一卷', order: 6 },
    { id: 'ch007', title: '第7章 余波', volume: '第一卷', order: 7 },
    { id: 'ch008', title: '第8章 新篇', volume: '第一卷', order: 8 },
    { id: 'ch009', title: '第9章 暗流', volume: '第一卷', order: 9 },
    { id: 'ch010', title: '第10章 风暴', volume: '第一卷', order: 10 },
    { id: 'ch011', title: '第11章 危机', volume: '第一卷', order: 11 },
    { id: 'ch012', title: '第12章 终局', volume: '第一卷', order: 12 },
  ];

  const MOCK_CHARACTERS = [
    { name: '林逸.md', content: '角色：林逸\\n身份：剑修\\n外貌：白衣胜雪\\n性格：沉稳内敛' },
    { name: '苏婉清.md', content: '角色：苏婉清\\n身份：药修\\n外貌：青衣如兰\\n性格：温柔聪慧' },
    { name: '墨渊.md', content: '角色：墨渊\\n身份：反派\\n外貌：黑袍如夜\\n性格：阴沉狡诈' },
  ];

  let MOCK_FORESHADOWS = {
    entries: [
      {
        id: 'fs001',
        name: '神秘玉佩',
        description: '主角继承了一块神秘玉佩',
        status: 'planted',
        category: 'item',
        importance: 0.8,
        plantedChapterId: 'ch001',
        targetChapterId: 'ch003',
        clues: [],
        relatedCharacters: ['林逸'],
        notes: '关键道具',
        createdAt: '2024-01-01T00:00',
        updatedAt: '2024-01-01T00:00',
      },
      {
        id: 'fs002',
        name: '暗影组织',
        description: '幕后黑手组织浮出水面',
        status: 'planted',
        category: 'mystery',
        importance: 1.0,
        plantedChapterId: 'ch002',
        targetChapterId: 'ch008',
        clues: [],
        relatedCharacters: ['墨渊'],
        notes: '',
        createdAt: '2024-01-01T00:00',
        updatedAt: '2024-01-01T00:00',
      },
      {
        id: 'fs003',
        name: '师门秘辛',
        description: '师门隐藏的秘密逐渐揭开',
        status: 'advanced',
        category: 'identity',
        importance: 0.6,
        plantedChapterId: 'ch001',
        targetChapterId: 'ch012',
        clues: [
          { chapterId: 'ch004', description: '在第4章通过对话暗示师门有秘密', timestamp: '2024-01-04T00:00' },
        ],
        relatedCharacters: ['林逸', '苏婉清'],
        notes: '',
        createdAt: '2024-01-01T00:00',
        updatedAt: '2024-01-04T00:00',
      },
      {
        id: 'fs004',
        name: '远古封印',
        description: '远古封印逐渐松动',
        status: 'planted',
        category: 'event',
        importance: 0.4,
        plantedChapterId: 'ch002',
        targetChapterId: null,
        clues: [],
        relatedCharacters: [],
        notes: '长线伏笔',
        createdAt: '2024-01-01T00:00',
        updatedAt: '2024-01-01T00:00',
      },
    ],
    updatedAt: '2024-01-05T00:00',
  };

  const MOCK_FORESHADOW_CONFIG = {
    upcomingWindow: 5,
    dormantThreshold: 3,
  };

  function invoke(cmd, args) {
    console.log('[TAURI MOCK] invoke:', cmd, JSON.stringify(args || {}).slice(0, 100));
    switch (cmd) {
      case 'list_projects':
        return Promise.resolve([MOCK_PROJECT]);
      case 'get_project':
        return Promise.resolve(MOCK_PROJECT);
      case 'list_chapters':
        return Promise.resolve(MOCK_CHAPTERS);
      case 'list_project_files': {
        const subdir = args && args.subdir;
        if (subdir === 'characters') {
          return Promise.resolve(MOCK_CHARACTERS.map(c => ({ name: c.name, size: c.content.length, modified: '2024-01-01' })));
        }
        return Promise.resolve([]);
      }
      case 'read_project_file': {
        const subdir = args && args.subdir;
        const filename = args && args.filename;
        if (subdir === 'characters') {
          const char = MOCK_CHARACTERS.find(c => c.name === filename);
          if (char) return Promise.resolve(char.content);
        }
        if (subdir === 'memory' && filename === 'foreshadows.json') {
          return Promise.resolve(JSON.stringify(MOCK_FORESHADOWS));
        }
        if (subdir === 'memory' && filename === 'foreshadow-config.json') {
          return Promise.resolve(JSON.stringify(MOCK_FORESHADOW_CONFIG));
        }
        return Promise.resolve('');
      }
      case 'write_project_file': {
        const subdir = args && args.subdir;
        const filename = args && args.filename;
        const content = args && args.content;
        if (subdir === 'memory' && filename === 'foreshadows.json') {
          try {
            const parsed = JSON.parse(content);
            MOCK_FORESHADOWS.entries = parsed.entries;
            MOCK_FORESHADOWS.updatedAt = parsed.updatedAt;
          } catch (e) {}
        }
        return Promise.resolve(null);
      }
      case 'delete_project_file':
        return Promise.resolve(null);
      case 'load_provider_config':
        return Promise.resolve({ providers: [], activeProvider: null });
      case 'search_project_files':
        return Promise.resolve([]);
      case 'vector_search_chunks':
        return Promise.resolve([]);
      case 'compute_daily_stats':
        return Promise.resolve([]);
      case 'list_chapter_versions':
        return Promise.resolve([]);
      case 'list_resource_categories':
        return Promise.resolve([]);
      case 'list_resource_files':
        return Promise.resolve([]);
      case 'search_resource_files':
        return Promise.resolve([]);
      case 'get_chapter_content':
        return Promise.resolve('');
      case 'get_chapter_outline':
        return Promise.resolve('');
      default:
        console.warn('[TAURI MOCK] Unknown command:', cmd);
        return Promise.resolve(null);
    }
  }

  // Tauri 2 internal API
  window.__TAURI_INTERNALS__ = window.__TAURI_INTERNALS__ || {};
  window.__TAURI_INTERNALS__.invoke = invoke;
  window.__TAURI_INTERNALS__.transformCallback = function(cb) {
    return Math.random().toString(36).slice(2);
  };
  
  console.log('[TAURI MOCK] Installed successfully');
})();
`;

// ─── Test Runner ───────────────────────────────────────────────

async function runTests() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  const page = await context.newPage();
  
  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => consoleMessages.push(`[${msg.type()}] ${msg.text()}`));
  
  const results = [];
  let testNum = 0;
  
  function record(name, pass, detail = '') {
    testNum++;
    const status = pass ? 'PASS' : 'FAIL';
    results.push({ num: testNum, name, pass, detail });
    console.log(`[${testNum}] ${status}: ${name}${detail ? ' -- ' + detail : ''}`);
  }
  
  // Inject Tauri mock before page loads
  await page.addInitScript(TAURI_MOCK_SCRIPT);

  // Navigate to the app
  console.log('Navigating to', BASE_URL);
  await page.goto(BASE_URL, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForTimeout(3000);
  
  // Take initial screenshot
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '01-initial-load.png') });
  
  // Debug: check what's on the page
  const bodyText = await page.textContent('body').catch(() => '(empty)');
  console.log('Page body text (first 500 chars):', bodyText.slice(0, 500));
  console.log('Console messages:', consoleMessages.slice(0, 10).join('\n'));
  
  // ─── Test 1: App loads and shows project ────────────────────────
  const projectVisible = await page.locator('text=测试小说').first().isVisible().catch(() => false);
  record('App loads and shows mock project', projectVisible, projectVisible ? 'Project visible' : 'Project NOT visible');
  
  // Click on the project to enter it
  if (projectVisible) {
    await page.locator('text=测试小说').first().click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '02-project-view.png') });
  
  // ─── Select a chapter first to set currentChapterId ───────────
  // The writing tab should be active by default. Wait for chapters to load.
  await page.waitForTimeout(1000);
  
  // Try to click on a chapter in the chapter sidebar (ch005 = 第5章 真相)
  // ChapterManager auto-loads chapters; we need to click one to set currentChapterId
  const chapterItem = page.locator('text=第5章').first();
  const chapterVisible = await chapterItem.isVisible().catch(() => false);
  if (chapterVisible) {
    await chapterItem.click();
    await page.waitForTimeout(1000);
    console.log('Selected chapter: 第5章 真相');
  } else {
    // Try alternative: click any chapter
    const anyChapter = page.locator('.chapter-item, .chapter-list-item').first();
    const anyChVisible = await anyChapter.isVisible().catch(() => false);
    if (anyChVisible) {
      await anyChapter.click();
      await page.waitForTimeout(1000);
      console.log('Selected first chapter');
    } else {
      console.log('No chapter items found - currentChapterId will be null');
    }
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '02b-chapter-selected.png') });
  
  // ─── Test 2: Navigate to foreshadow tab ──────────────────────────
  const foreshadowTab = page.locator('button.tab-btn:has-text("伏笔")');
  const tabVisible = await foreshadowTab.isVisible().catch(() => false);
  record('Foreshadow tab button visible', tabVisible);
  
  if (tabVisible) {
    await foreshadowTab.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '03-foreshadow-panel.png') });
  
  // ─── Test 3: Verify urgency badges show 4-level labels ───────────
  const pageText = await page.textContent('body').catch(() => '');
  
  const hasCriticalBadge = pageText.includes('🔴') && pageText.includes('必须回收');
  const hasUpcomingBadge = pageText.includes('🟡') && pageText.includes('即将到期');
  const hasActiveBadge = pageText.includes('🔵') && pageText.includes('推进中');
  const hasBackgroundBadge = pageText.includes('⚪') && pageText.includes('已埋设');
  
  record('Urgency badge: critical (🔴 必须回收)', hasCriticalBadge, hasCriticalBadge ? 'Found' : 'NOT found');
  record('Urgency badge: upcoming (🟡 即将到期)', hasUpcomingBadge, hasUpcomingBadge ? 'Found' : 'NOT found');
  record('Urgency badge: active (🔵 推进中)', hasActiveBadge, hasActiveBadge ? 'Found' : 'NOT found');
  record('Urgency badge: background (⚪ 已埋设)', hasBackgroundBadge, hasBackgroundBadge ? 'Found' : 'NOT found');
  
  // Verify old format is NOT present
  const hasOldFormat = pageText.includes('已过') && pageText.includes('章');
  record('Old urgency format [已过N章] NOT present', !hasOldFormat, !hasOldFormat ? 'Old format absent' : 'Old format STILL present');
  
  // ─── Test 4: Open add form and verify advanced section ──────────
  const addBtn = page.locator('button:has-text("新增伏笔")');
  const addBtnVisible = await addBtn.isVisible().catch(() => false);
  record('Add foreshadow button visible', addBtnVisible);
  
  if (addBtnVisible) {
    await addBtn.click();
    await page.waitForTimeout(1000);
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '04-add-form.png') });
  
  // Verify form is open
  const formVisible = await page.locator('h3:has-text("新增伏笔")').isVisible().catch(() => false);
  record('Add/Edit form opens', formVisible);
  
  // Click advanced toggle
  const advancedToggle = page.locator('.advanced-toggle');
  const advancedVisible = await advancedToggle.isVisible().catch(() => false);
  if (advancedVisible) {
    await advancedToggle.click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '05-advanced-section.png') });
  
  // ─── Test 5: Verify clues editor in advanced section ────────────
  // The label is "📋 推进轨迹" — use CSS class or partial text match
  const cluesEditorEl = await page.locator('.clues-editor').isVisible().catch(() => false);
  record('Advanced section has clues editor (推进轨迹)', cluesEditorEl, cluesEditorEl ? 'Found .clues-editor' : '.clues-editor NOT found');
  
  const addClueBtn = await page.locator('button:has-text("添加推进记录")').isVisible().catch(() => false);
  record('Clues editor has "添加推进记录" button', addClueBtn);
  
  // ─── Test 6: Verify character selector is dropdown style ────────
  const dropdownBtn = await page.locator('.character-dropdown-btn').isVisible().catch(() => false);
  record('Character selector is dropdown button style', dropdownBtn, dropdownBtn ? 'Dropdown button found' : 'Dropdown button NOT found');
  
  // Check that panel is hidden before clicking
  const dropdownPanelBefore = await page.locator('.character-dropdown-panel').isVisible().catch(() => false);
  record('Character dropdown panel hidden before click', !dropdownPanelBefore);
  
  // Click dropdown to open
  if (dropdownBtn) {
    await page.locator('.character-dropdown-btn').click();
    await page.waitForTimeout(500);
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '06-character-dropdown.png') });
  
  const dropdownPanelAfter = await page.locator('.character-dropdown-panel').isVisible().catch(() => false);
  record('Character dropdown panel opens on click', dropdownPanelAfter);
  
  // Close form
  await page.locator('button:has-text("取消")').last().click().catch(() => {});
  await page.waitForTimeout(500);
  
  // ─── Test 7: Verify character panel shows related foreshadows ───
  // Navigate to character tab
  const charTab = page.locator('button.tab-btn:has-text("角色")');
  await charTab.click().catch(() => {});
  await page.waitForTimeout(2000);
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '07-character-panel.png') });
  
  // Click on a character (林逸) - look for character in sidebar
  const charItem = page.locator('text=林逸').first();
  const charItemVisible = await charItem.isVisible().catch(() => false);
  record('Character 林逸 visible in character panel', charItemVisible);
  
  if (charItemVisible) {
    await charItem.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '08-character-detail.png') });
  
  // Check for related foreshadows section
  const charPageText = await page.textContent('body').catch(() => '');
  const hasRelatedForeshadows = charPageText.includes('关联伏笔');
  record('Character panel shows related foreshadows section', hasRelatedForeshadows, hasRelatedForeshadows ? 'Found 关联伏笔' : '关联伏笔 NOT found');
  
  // Check for specific foreshadow names
  const hasMysteriousJade = charPageText.includes('神秘玉佩');
  const hasMasterSecret = charPageText.includes('师门秘辛');
  record('Related foreshadow "神秘玉佩" visible in character view', hasMysteriousJade);
  record('Related foreshadow "师门秘辛" visible in character view', hasMasterSecret);
  
  // ─── Test 8: Click foreshadow from character panel -> tab switches ─
  const foreshadowLink = page.locator('.char-foreshadow-link').first();
  const linkVisible = await foreshadowLink.isVisible().catch(() => false);
  record('Foreshadow link clickable in character panel', linkVisible);
  
  if (linkVisible) {
    await foreshadowLink.click();
    await page.waitForTimeout(2000);
  }
  await page.screenshot({ path: path.join(EVIDENCE_DIR, '09-foreshadow-tab-switched.png') });
  
  // Verify we're now on the foreshadow tab
  const foreshadowPanelVisible = await page.locator('.foreshadow-panel').isVisible().catch(() => false);
  record('Tab switched to foreshadow panel after clicking link', foreshadowPanelVisible, foreshadowPanelVisible ? 'Foreshadow panel visible' : 'Foreshadow panel NOT visible');
  
  // ─── Summary ───────────────────────────────────────────────────
  const passed = results.filter(r => r.pass).length;
  const total = results.length;
  const failed = total - passed;
  
  console.log('\n=== UI TEST SUMMARY ===');
  console.log('Total: ' + total + ', Passed: ' + passed + ', Failed: ' + failed);
  console.log('Result: ' + passed + '/' + total + ' ' + (failed === 0 ? 'PASS' : 'FAIL'));
  
  // Write results to file
  const summary = results.map(r => 
    '[' + r.num + '] ' + (r.pass ? 'PASS' : 'FAIL') + ': ' + r.name + (r.detail ? ' -- ' + r.detail : '')
  ).join('\n');
  
  const reportContent = '# UI Test Results\n\n## Summary: ' + passed + '/' + total + ' ' + (failed === 0 ? 'PASS' : 'FAIL') + '\n\n' + summary + '\n\n## Console Messages\n\n' + consoleMessages.slice(0, 30).join('\n') + '\n';
  fs.writeFileSync(path.join(EVIDENCE_DIR, 'ui-test-results.md'), reportContent);
  
  await browser.close();
  
  return { passed, total, failed, results };
}

runTests().then(result => {
  process.exit(result.failed === 0 ? 0 : 1);
}).catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});