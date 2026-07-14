# UI Test Results

## Summary: 20/20 PASS

[1] PASS: App loads and shows mock project -- Project visible
[2] PASS: Foreshadow tab button visible
[3] PASS: Urgency badge: critical (🔴 必须回收) -- Found
[4] PASS: Urgency badge: upcoming (🟡 即将到期) -- Found
[5] PASS: Urgency badge: active (🔵 推进中) -- Found
[6] PASS: Urgency badge: background (⚪ 已埋设) -- Found
[7] PASS: Old urgency format [已过N章] NOT present -- Old format absent
[8] PASS: Add foreshadow button visible
[9] PASS: Add/Edit form opens
[10] PASS: Advanced section has clues editor (推进轨迹) -- Found .clues-editor
[11] PASS: Clues editor has "添加推进记录" button
[12] PASS: Character selector is dropdown button style -- Dropdown button found
[13] PASS: Character dropdown panel hidden before click
[14] PASS: Character dropdown panel opens on click
[15] PASS: Character 林逸 visible in character panel
[16] PASS: Character panel shows related foreshadows section -- Found 关联伏笔
[17] PASS: Related foreshadow "神秘玉佩" visible in character view
[18] PASS: Related foreshadow "师门秘辛" visible in character view
[19] PASS: Foreshadow link clickable in character panel
[20] PASS: Tab switched to foreshadow panel after clicking link -- Foreshadow panel visible

## Console Messages

[log] [TAURI MOCK] Installed successfully
[debug] [vite] connecting...
[info] %cDownload the React DevTools for a better development experience: https://react.dev/link/react-devtools font-weight:bold
[log] [TAURI MOCK] invoke: list_projects {}
[log] [TAURI MOCK] invoke: list_projects {}
[debug] [vite] connected.
[log] [TAURI MOCK] invoke: list_chapters {"projectId":"test-project-001"}
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"memory","filename":"_chapter_titles.json"}
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"notes","filename":"notes.json"}
[log] [TAURI MOCK] invoke: list_chapters {"projectId":"test-project-001"}
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"memory","filename":"_chapter_titles.json"}
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"notes","filename":"notes.json"}
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"memory","filename":"_volume_names.json"}
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"memory","filename":"_volume_names.json"}
[log] [TAURI MOCK] invoke: list_project_files {"projectId":"test-project-001","subdir":"notes"}
[log] [TAURI MOCK] invoke: list_project_files {"projectId":"test-project-001","subdir":"notes"}
[log] [TAURI MOCK] invoke: get_chapter_content {"projectId":"test-project-001","volume":"第一卷","chapterId":"ch001"}
[log] [TAURI MOCK] invoke: get_chapter_content {"projectId":"test-project-001","volume":"第一卷","chapterId":"ch001"}
[log] [Editor] 加载章节 ch001 完成，内容长度: 0，前100字符: 
[log] [Editor] 加载章节 ch001 完成，内容长度: 0，前100字符: 
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"memory","filename":"_chapter_wordcounts.json"}
[log] [TAURI MOCK] invoke: append_stat_event {"projectId":"test-project-001","event":{"timestamp":"2026-07-14T07:32:32.106Z","event_type":"sessio
[warning] [TAURI MOCK] Unknown command: append_stat_event
[log] [Editor] 卸载保存 ch001，内容长度: 7，前100字符: <p></p>
[log] [TAURI MOCK] invoke: save_chapter_content {"projectId":"test-project-001","volume":"第一卷","chapterId":"ch001","content":"<p></p>"}
[warning] [TAURI MOCK] Unknown command: save_chapter_content
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"memory","filename":"_chapter_wordcounts.json"}
[log] [TAURI MOCK] invoke: append_stat_event {"projectId":"test-project-001","event":{"timestamp":"2026-07-14T07:32:32.108Z","event_type":"sessio
[warning] [TAURI MOCK] Unknown command: append_stat_event
[log] [TAURI MOCK] invoke: read_project_file {"projectId":"test-project-001","subdir":"outline","filename":"_chapter_meta.json"}
