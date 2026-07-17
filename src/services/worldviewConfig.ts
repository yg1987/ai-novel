// src/services/worldviewConfig.ts
// Worldview section configuration — genre presets + user customization

import { readProjectFile, writeProjectFile } from '../api/tauri'
import { asString, isRecord } from '../utils/unknown'

export interface SubField {
  key: string
  label: string
  hint: string
}

export interface SectionDef {
  key: string
  label: string
  file: string
  subs: SubField[]
  hint: string
}

const CONFIG_FILE = '_worldview_sections.json'

function parseSubField(value: unknown): SubField | null {
  if (!isRecord(value)) return null
  const key = asString(value.key)
  if (!key) return null
  return {
    key,
    label: asString(value.label, key),
    hint: asString(value.hint),
  }
}

function parseSection(value: unknown): SectionDef | null {
  if (!isRecord(value)) return null
  const key = asString(value.key)
  const file = asString(value.file)
  if (!key || !file) return null
  const subs = Array.isArray(value.subs)
    ? value.subs.map(parseSubField).filter((sub): sub is SubField => sub !== null)
    : []
  return {
    key,
    label: asString(value.label, key),
    file,
    subs,
    hint: asString(value.hint),
  }
}

function parseSections(value: unknown): SectionDef[] | null {
  if (!Array.isArray(value)) return null
  const sections = value.map(parseSection).filter((section): section is SectionDef => section !== null)
  return sections.length > 0 ? sections : null
}

// ─── Genre presets ────────────────────────────────────────

const GENRE_SECTIONS: Record<string, SectionDef[]> = {
  '玄幻': [
    {
      key: 'world', label: '世界背景', file: 'world.md',
      hint: '描述这个世界的基本设定，让读者对故事发生的世界有个大致印象',
      subs: [
        { key: '世界概况', label: '世界概况', hint: '这个世界是什么样子的？时代背景、地理格局、整体氛围' },
        { key: '历史事件', label: '历史事件', hint: '有哪些重要的历史事件？战争、灾难、传奇人物的陨落等' },
        { key: '特殊规则', label: '特殊规则', hint: '这个世界有哪些独有规则？修炼体系、自然法则、社会禁忌等' },
      ],
    },
    {
      key: 'forces', label: '势力组织', file: 'forces.md',
      hint: '列出故事中的主要势力，简单描述其立场和相互关系',
      subs: [
        { key: '势力列表', label: '势力列表', hint: '列出主要势力、宗派、家族，每行写一个，附一句话描述' },
      ],
    },
    {
      key: 'locations', label: '重要地点', file: 'locations.md',
      hint: '列出世界中的重要地点，简单描述其特点',
      subs: [],
    },
    {
      key: 'power-system', label: '力量体系', file: 'power-system.md',
      hint: '描述力量体系的核心规则',
      subs: [
        { key: '境界划分', label: '境界划分', hint: '修炼境界的等级名称和特征，从低到高排列' },
      ],
    },
    {
      key: 'timeline', label: '全局时间线', file: 'timeline.md',
      hint: '按时间顺序列出故事世界中的重要事件节点',
      subs: [],
    },
  ],

  '都市': [
    {
      key: 'city-bg', label: '城市背景', file: 'city-bg.md',
      hint: '描述故事发生的城市环境和社会背景',
      subs: [
        { key: '城市概况', label: '城市概况', hint: '故事发生在哪座城市？时代背景、城市规模、整体氛围' },
        { key: '社会现状', label: '社会现状', hint: '社会阶层分布、行业特点、主流价值观' },
      ],
    },
    {
      key: 'scenes', label: '主要场景', file: 'scenes.md',
      hint: '列出故事中反复出现的重要场景',
      subs: [
        { key: '主角住所', label: '主角住所', hint: '主角住在什么地方？小区环境、房间布局' },
        { key: '工作/学习场所', label: '工作/学习场所', hint: '公司、学校等日常场所的描写要点' },
        { key: '常去地点', label: '常去地点', hint: '主角经常出没的场所（咖啡馆、健身房、公园等）' },
      ],
    },
    {
      key: 'social', label: '社交圈/家族', file: 'social.md',
      hint: '描述主角的社交圈和家族关系',
      subs: [
        { key: '家族关系', label: '家族关系', hint: '家族成员、家族背景、家族矛盾（如有）' },
        { key: '社交圈', label: '社交圈', hint: '朋友圈、同事圈、行业人脉' },
      ],
    },
    {
      key: 'timeline', label: '全局时间线', file: 'timeline.md',
      hint: '按时间顺序列出故事中的重要事件节点',
      subs: [],
    },
  ],

  '言情': [
    {
      key: 'romance-bg', label: '故事背景', file: 'romance-bg.md',
      hint: '描述故事发生的时代和环境背景',
      subs: [
        { key: '时代背景', label: '时代背景', hint: '故事发生在什么时代？社会风气、价值观' },
        { key: '故事基调', label: '故事基调', hint: '甜宠、虐恋、破镜重圆？整体情感基调' },
      ],
    },
    {
      key: 'scenes', label: '主要场景', file: 'scenes.md',
      hint: '列出故事中重要的场景地点',
      subs: [
        { key: '相遇场景', label: '相遇场景', hint: '男女主第一次相遇/重逢的地点' },
        { key: '日常场景', label: '日常场景', hint: '两人经常相处的地方（公司、学校、公寓等）' },
        { key: '关键场景', label: '关键场景', hint: '感情转折的关键地点' },
      ],
    },
    {
      key: 'social', label: '人物关系', file: 'social.md',
      hint: '描述主角的家庭背景和社交关系',
      subs: [
        { key: '家族背景', label: '家族背景', hint: '双方家庭背景、家族利益关系' },
        { key: '社交圈', label: '社交圈', hint: '闺蜜、兄弟、助攻、情敌等角色' },
      ],
    },
    {
      key: 'timeline', label: '全局时间线', file: 'timeline.md',
      hint: '按时间顺序记录故事中的重要事件',
      subs: [],
    },
  ],

  '科幻': [
    {
      key: 'scifi-world', label: '世界观', file: 'scifi-world.md',
      hint: '描述科幻世界的时代背景和科技水平',
      subs: [
        { key: '时代设定', label: '时代设定', hint: '未来什么年代？星际时代/赛博朋克/末世等' },
        { key: '科技水平', label: '科技水平', hint: '主要科技成就：AI、基因编辑、曲速引擎等' },
      ],
    },
    {
      key: 'tech-system', label: '科技体系', file: 'tech-system.md',
      hint: '描述故事中的核心技术体系',
      subs: [
        { key: '核心技术', label: '核心技术', hint: '故事围绕什么科技展开？其原理和表现' },
        { key: '技术限制', label: '技术限制', hint: '该技术有什么限制或代价？' },
      ],
    },
    {
      key: 'forces', label: '势力/公司', file: 'forces.md',
      hint: '列出故事中的主要势力和组织',
      subs: [
        { key: '主要组织', label: '主要组织', hint: '公司、政府、军事组织、抵抗组织等' },
      ],
    },
    {
      key: 'locations', label: '重要地点', file: 'locations.md',
      hint: '列出故事中的重要地点',
      subs: [],
    },
    {
      key: 'timeline', label: '全局时间线', file: 'timeline.md',
      hint: '按时间顺序列出关键历史事件和故事节点',
      subs: [],
    },
  ],

  '悬疑': [
    {
      key: 'case-bg', label: '案件背景', file: 'case-bg.md',
      hint: '描述案件的基本情况',
      subs: [
        { key: '案发信息', label: '案发信息', hint: '案件类型、案发时间地点、基本情况' },
        { key: '受害人', label: '受害人', hint: '受害人的身份、背景、社会关系' },
        { key: '线索汇总', label: '线索汇总', hint: '目前掌握的线索，按重要程度排列' },
      ],
    },
    {
      key: 'locations', label: '关键地点', file: 'locations.md',
      hint: '列出与案件相关的重要地点',
      subs: [
        { key: '案发现场', label: '案发现场', hint: '案件发生地的细节描述' },
        { key: '关联场所', label: '关联场所', hint: '与案件相关的其他地方（嫌疑人家、藏匿点等）' },
      ],
    },
    {
      key: 'suspects', label: '嫌疑人/关系网', file: 'suspects.md',
      hint: '列出嫌疑人和相关人物关系',
      subs: [
        { key: '嫌疑人', label: '嫌疑人', hint: '嫌疑人的动机、不在场证明、可疑行为' },
        { key: '关系网', label: '关系网', hint: '受害人的人际关系、利益关联' },
      ],
    },
    {
      key: 'timeline', label: '线索时间线', file: 'timeline.md',
      hint: '按时间顺序列出案件相关事件',
      subs: [],
    },
  ],

  '历史': [
    {
      key: 'era-bg', label: '时代背景', file: 'era-bg.md',
      hint: '描述故事发生的历史时代',
      subs: [
        { key: '时代概况', label: '时代概况', hint: '具体朝代或时期？年号、文化特征' },
        { key: '经济与社会', label: '经济与社会', hint: '经济发展水平、社会结构、民生状况' },
      ],
    },
    {
      key: 'politics', label: '政治格局', file: 'politics.md',
      hint: '描述当时的政治形势',
      subs: [
        { key: '势力分布', label: '势力分布', hint: '主要政治势力、边疆局势、藩镇/诸侯' },
        { key: '官职制度', label: '官职制度', hint: '官制、科举、律法等制度特征' },
      ],
    },
    {
      key: 'locations', label: '重要地点', file: 'locations.md',
      hint: '列出故事中的重要地点',
      subs: [
        { key: '京都/都城', label: '京都/都城', hint: '政治中心描述' },
        { key: '战场/边疆', label: '战场/边疆', hint: '战争地点或边境地带' },
      ],
    },
    {
      key: 'social-class', label: '社会阶层', file: 'social-class.md',
      hint: '描述社会的阶级结构和礼法制度',
      subs: [
        { key: '阶级划分', label: '阶级划分', hint: '士农工商、门阀世家、等级制度' },
        { key: '礼法规矩', label: '礼法规矩', hint: '礼仪、禁忌、社会规范' },
      ],
    },
    {
      key: 'timeline', label: '关键事件时间线', file: 'timeline.md',
      hint: '按时间顺序列出历史大事记',
      subs: [],
    },
  ],

  '游戏': [
    {
      key: 'game-world', label: '世界设定', file: 'game-world.md',
      hint: '描述游戏世界的基本设定',
      subs: [
        { key: '世界观', label: '世界观', hint: '游戏的背景故事、世界格局' },
        { key: '基础设定', label: '基础设定', hint: '游戏类型（MMO/MOBA/卡牌等）、核心玩法' },
      ],
    },
    {
      key: 'class-system', label: '职业/技能体系', file: 'class-system.md',
      hint: '描述游戏中的职业和技能系统',
      subs: [
        { key: '职业设定', label: '职业设定', hint: '有哪些职业？每个职业的特点和定位' },
        { key: '技能/等级', label: '技能/等级', hint: '升级体系、技能树、转职条件' },
      ],
    },
    {
      key: 'forces', label: '势力/公会', file: 'forces.md',
      hint: '列出游戏中的主要势力和公会',
      subs: [
        { key: '公会/帮派', label: '公会/帮派', hint: '主要公会、帮派、联盟的设定' },
      ],
    },
    {
      key: 'locations', label: '重要地点', file: 'locations.md',
      hint: '列出游戏世界中的重要地点',
      subs: [],
    },
    {
      key: 'timeline', label: '全局时间线', file: 'timeline.md',
      hint: '记录游戏世界中的重大事件时间线',
      subs: [],
    },
  ],

  '轻小说': [
    {
      key: 'light-world', label: '世界设定', file: 'light-world.md',
      hint: '描述故事世界的基本设定',
      subs: [
        { key: '背景介绍', label: '背景介绍', hint: '这是一个什么样的世界？日常系、异世界、学园等' },
        { key: '特殊设定', label: '特殊设定', hint: '有什么独特但轻松的设定？特殊能力、校园传说等' },
      ],
    },
    {
      key: 'scenes', label: '主要场景', file: 'scenes.md',
      hint: '列出故事中的主要场景',
      subs: [
        { key: '学校/日常', label: '学校/日常', hint: '校园环境、社团活动、日常场景' },
        { key: '秘密基地', label: '秘密基地', hint: '主角团聚集的秘密场所' },
      ],
    },
    {
      key: 'special', label: '特殊能力/设定', file: 'special.md',
      hint: '描述故事中的特殊能力或独特设定',
      subs: [
        { key: '能力设定', label: '能力设定', hint: '特殊能力的种类、发动条件、限制' },
        { key: '世界规则', label: '世界规则', hint: '这个世界的隐藏规则或秘密设定' },
      ],
    },
    {
      key: 'timeline', label: '全局时间线', file: 'timeline.md',
      hint: '记录故事中的重要事件时间线',
      subs: [],
    },
  ],
}

// ─── Genre-preset examples ───────────────────────────────

export const GENRE_EXAMPLES: Record<string, Record<string, Record<string, string>>> = {
  '玄幻': {
    world: {
      '世界概况': `这是一个以武道为尊的世界。大陆分为东荒、南岭、西漠、北原、中州五域，修炼之风盛行。

→ 可以改成你自己的：修仙、魔法、星际、末日，两三句话说明白就好。`,
      '历史事件': `三千年前，天帝斩落天外邪魔，肉身化作封印镇守天渊。

→ 按时间顺序列 2-3 个重大事件就够了。`,
      '特殊规则': `修炼境界：淬体 → 开元 → 金丹 → 元婴 → 化神
魂力天生，无法通过修炼增长。

→ 有什么跟现实不一样的设定？列出来。`,
    },
    forces: {
      '势力列表': `玄天宗：正道之首，以剑修闻名。
血煞教：北原魔教，擅长傀儡术。

→ 每行写一个势力，附一句话描述。`,
    },
    locations: {
      _default: `东荒：蛮荒之地，妖兽横行。
天渊秘境：上古战场遗迹，每百年开启一次。

→ 地名加冒号，跟一句话描述。`,
    },
    'power-system': {
      '境界划分': `淬体境：锤炼肉身，力能扛鼎。
开元境：开辟丹田，真气外放。
金丹境：凝聚金丹，寿元大增。

→ 从低到高排列，每行一个境界。`,
    },
    timeline: {
      _default: `纪元前 3000 年：天帝斩天外邪魔，封印天渊。
纪元元年：纪元开启。

→ 按时间顺序，每行一个事件。`,
    },
  },

  '都市': {
    'city-bg': {
      '城市概况': `上海，2024年。一座充滿机遇与压力的国际化大都市。

→ 换成你故事发生的城市，两三句话概括。`,
      '社会现状': `互联网行业高速发展，996文化盛行，房价高企。

→ 结合你的故事主题来写。`,
    },
    scenes: {
      '主角住所': `浦东新区某高层公寓，30楼，落地窗可俯瞰陆家嘴。

→ 主角住的环境反映了ta的身份和性格。`,
      '工作/学习场所': `市中心某互联网公司开放办公区，格子间里代码声噼啪作响。

→ 写清楚职场环境是故事的重要背景。`,
      '常去地点': `公司楼下便利店、拐角的猫咖、周末去的羽毛球馆。

→ 日常场景让故事有生活气息。`,
    },
    social: {
      '家族关系': `父亲是退休中学教师，母亲经营一家小花店。

→ 即使故事不涉及家族，简单设定也会让人物更立体。`,
      '社交圈': `大学室友三人组，每周五火锅局。

→ 朋友关系的设定让社交互动有据可依。`,
    },
    timeline: {
      _default: `2024年3月：主角跳槽到新公司。
2024年5月：公司团建，第一次和同事们出省。

→ 按时间顺序记录故事中的重要节点。`,
    },
  },

  '言情': {
    'romance-bg': {
      '时代背景': `2024年，当代中国，一线城市。

→ 明确时代和地点，影响整个故事的风格。`,
      '故事基调': `甜宠文，双向暗恋，日常向。

→ 明确基调帮助AI生成风格一致的文本。`,
    },
    scenes: {
      '相遇场景': `公司电梯里，女主抱的文件撒了一地，男主帮她捡。

→ 经典相遇场景，也可以设计更有记忆点的。`,
      '日常场景': `同一栋写字楼的隔壁公司，午餐时间常在同一家便利店偶遇。

→ 日常场景要自然，让感情发展有充足空间。`,
      '关键场景': `公司年会的真心话大冒险——这是全书的感情转折点。

→ 需要精心设计的关键场景。`,
    },
    social: {
      '家族背景': `女主：书香门第，父亲是大学教授，母亲是钢琴老师。
男主：商业世家，集团继承人，家庭关系复杂。

→ 家族背景影响人物的行为逻辑和冲突来源。`,
      '社交圈': `女主的闺蜜团：大学室友+同事；男主的兄弟团：发小+合伙人。

→ 配角团是助攻/阻力的关键来源。`,
    },
    timeline: {
      _default: `2024年6月：初遇
2024年8月：第一次单独吃饭
2024年12月：告白

→ 记录感情发展的关键节点。`,
    },
  },

  '科幻': {
    'scifi-world': {
      '时代设定': `2157年，人类已在地球、月球和火星建立殖民地。

→ 明确时间节点和人类文明的阶段。`,
      '科技水平': `可控核聚变普及、强人工智能、基因编辑合法化。

→ 主要科技成就决定了故事的可能性。`,
    },
    'tech-system': {
      '核心技术': `量子网络意识传输技术——人的意识可上传至量子网络。

→ 故事围绕什么科技展开？说明其原理。`,
      '技术限制': `意识传输后只能维持 72 小时，否则神经元不可逆损伤。

→ 技术的限制和代价才是戏剧冲突的来源。`,
    },
    forces: {
      '主要组织': `地球联邦：表面上的全球统一政府。
量子公司：掌握核心技术的超级企业。

→ 科幻世界中组织关系往往决定格局。`,
    },
    locations: {
      _default: `月球城「广寒」：人类最大的地外定居点。
量子大厦：地球联邦最宏伟的建筑，量子公司总部。

→ 科幻地点要有未来感和逻辑。`,
    },
    timeline: {
      _default: `2103年：量子计算突破，AI 觉醒元年。
2130年：人类首次实现意识传输。

→ 记录历史和故事中的关键时间节点。`,
    },
  },

  '悬疑': {
    'case-bg': {
      '案发信息': `案件类型：密室杀人案
案发时间：2024年12月24日深夜

→ 案件的基本信息是故事的基础。`,
      '受害人': `林氏集团董事长，男，45岁，近期正在推动一项争议性并购案。

→ 受害人的身份往往藏着案件动机。`,
      '线索汇总': `1. 密室状态：门从内反锁
2. 现场物品：一杯红酒、一枚袖扣

→ 线索要有逻辑地排列，方便梳理。`,
    },
    locations: {
      '案发现场': `顶层总裁办公室，落地窗面朝江景，门锁完好。

→ 现场细节的描写要有条理。`,
      '关联场所': `地下停车场（受害人的车还停在那里）
嫌疑人公寓（需要搜查令）

→ 与案件相关的其他场所。`,
    },
    suspects: {
      '嫌疑人': `副总王某：与受害人近期有激烈争吵，无不在场证明。

→ 每个嫌疑人的动机和疑点。`,
      '关系网': `受害人近期正在离婚诉讼，妻子有巨额保险受益人身份。

→ 人际关系往往隐藏着真正的动机。`,
    },
    timeline: {
      _default: `12月24日 22:00：受害人最后被目击
12月25日 08:00：秘书发现尸体

→ 时间线是推理的核心工具。`,
    },
  },

  '历史': {
    'era-bg': {
      '时代概况': `明朝嘉靖年间（1522-1566），海禁政策下的沿海地区。

→ 明确朝代、年号、地理位置。`,
      '经济与社会': `海上贸易被禁，民间走私盛行，倭寇与海商实为一体。

→ 经济基础决定了故事的可能性空间。`,
    },
    politics: {
      '势力分布': `朝中严嵩党与清流派的对立，沿海有戚家军、海盗、倭寇三方角力。

→ 政治格局是历史类故事的核心背景。`,
      '官职制度': `首辅掌内阁，厂卫直属皇帝监察百官。

→ 官职制度决定人物晋升路径和权力网络。`,
    },
    locations: {
      '京都/都城': `北京紫禁城，层层宫墙隔开了天子与百姓。

→ 故事的核心政治舞台。`,
      '战场/边疆': `辽东防线，对抗后金的第一线。

→ 如果有战争元素，写清战场环境。`,
    },
    'social-class': {
      '阶级划分': `士大夫阶层垄断仕途，商人地位低下但财力雄厚。

→ 阶级背景决定人物出身和行动限制。`,
      '礼法规矩': `三纲五常、科举制度、宗法礼教构成社会的基本规则。

→ 礼法既是约束也是故事冲突的来源。`,
    },
    timeline: {
      _default: `嘉靖二十一年：宫婢之变，嘉靖帝险些被勒死
嘉靖二十九年：庚戌之变，俺答兵临北京

→ 真实历史事件与虚构情节交织。`,
    },
  },
}

// ─── Generic fallback examples ───────────────────────────

const GENERIC_EXAMPLES: Record<string, Record<string, string>> = {
  _section: {
    _default: `在这里写下你的设定，越具体越好。

→ 不用追求文笔，把想法写清楚就行。`,
  },
}

// ─── Service functions ───────────────────────────────────

/**
 * Get the built-in default sections for a given genre.
 */
export function getDefaultSections(genre: string): SectionDef[] {
  return (GENRE_SECTIONS[genre] ?? GENRE_SECTIONS['玄幻'])!
}

/**
 * Get example text for a section + sub-field, genre-aware.
 */
export function getExample(genre: string, sectionKey: string, subKey: string): string | undefined {
  const genreExamples = GENRE_EXAMPLES[genre]
  if (genreExamples) {
    const sectionExamples = genreExamples[sectionKey]
    if (sectionExamples) {
      if (subKey && sectionExamples[subKey]) return sectionExamples[subKey]
      if (sectionExamples._default) return sectionExamples._default
    }
  }
  // Fallback: try generic
  return GENERIC_EXAMPLES._section?._default
}

/**
 * Load worldview sections from project config file.
 * Supports both old format (array) and new format ({genre, sections}).
 * Returns null if no config file exists (caller should init with defaults).
 */
export async function loadSections(projectId: string): Promise<SectionDef[] | null> {
  try {
    const raw = await readProjectFile(projectId, 'worldview', CONFIG_FILE)
    const parsed: unknown = JSON.parse(raw)
    // New format: { genre, sections }
    if (isRecord(parsed)) {
      return parseSections(parsed.sections)
    }
    // Old format: array of sections
    return parseSections(parsed)
  } catch {
    return null
  }
}

/**
 * Read the genre that worldview sections were initialized for.
 * Returns null for old-format configs (genre unknown).
 */
export async function loadSectionsGenre(projectId: string): Promise<string | null> {
  try {
    const raw = await readProjectFile(projectId, 'worldview', CONFIG_FILE)
    const parsed: unknown = JSON.parse(raw)
    return isRecord(parsed) && typeof parsed.genre === 'string' ? parsed.genre : null
  } catch {
    return null
  }
}

/**
 * Save worldview sections to project config file.
 * Always writes the new format { genre, sections }.
 * If genre is not provided, tries to preserve the existing stored genre.
 */
export async function saveSections(projectId: string, sections: SectionDef[], genre?: string): Promise<void> {
  let resolvedGenre = genre
  if (!resolvedGenre) {
    try {
      const raw = await readProjectFile(projectId, 'worldview', CONFIG_FILE)
      const existing: unknown = JSON.parse(raw)
      if (isRecord(existing) && typeof existing.genre === 'string') resolvedGenre = existing.genre
    } catch { /* ignore */ }
  }
  await writeProjectFile(projectId, 'worldview', CONFIG_FILE, JSON.stringify({ genre: resolvedGenre ?? '', sections }, null, 2))
}
