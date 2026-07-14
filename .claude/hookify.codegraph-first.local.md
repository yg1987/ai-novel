---
name: codegraph-first
enabled: true
event: prompt
pattern: \[analyze-mode\]|\[search-mode\]|分析.*(项目|代码|结构|实现|调用)|查找.*(代码|位置|文件|符号|实现)|怎么.*(实现|调用|结构|排序)|代码.*(在哪里|结构|关系)|梳理.*结构
action: warn
---

⛔ **STOP — 必须先跑 codegraph**

检测到分析类请求。根据规则，你必须**先使用 codegraph**，不得直接调用 grep/read。

**强制步骤：**

1. `codegraph status` — 检查索引状态
2. 如果未初始化：`codegraph init && codegraph index`
3. `codegraph explore <关键类/函数>` — 获取符号源 + 调用路径
4. `codegraph query <关键词>` — 搜索符号
5. `codegraph callers/callees <符号>` — 调用关系

**禁止行为：**
- ❌ 直接 grep 搜索代码位置
- ❌ 直接 read 遍历文件找结构
- ❌ 用任何非 codegraph 手段替代

在完成 codegraph 查询后，才可以用 grep/read 补充细节。
