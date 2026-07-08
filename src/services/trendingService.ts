// src/services/trendingService.ts
// Static reference data for trending web novel themes/tags.

export interface TrendingCategory {
  genre: string
  tags: TrendingTag[]
}

export interface TrendingTag {
  name: string
  popularity: number   // 0-100
  description: string
  examples: string[]
}

const TRENDING_DATA: TrendingCategory[] = [
  {
    genre: '玄幻',
    tags: [
      { name: '重生', popularity: 95, description: '主角带着前世记忆重生回少年时代，弥补遗憾、改写命运', examples: ['《凡人修仙传》', '《诡秘之主》'] },
      { name: '系统流', popularity: 90, description: '主角获得系统/面板辅助，数据化成长，快速变强', examples: ['《斗破苍穹》', '《全职高手》'] },
      { name: '穿越异界', popularity: 88, description: '现代人穿越到异世界，利用现代知识降维打击', examples: ['《庆余年》', '《赘婿》'] },
      { name: '修仙', popularity: 85, description: '传统修仙体系：炼气→筑基→金丹→元婴→化神', examples: ['《仙逆》', '《凡人修仙传》'] },
      { name: '血脉觉醒', popularity: 82, description: '主角觉醒特殊血脉/体质，获得强大力量', examples: ['《完美世界》', '《一世之尊》'] },
      { name: '升级爆装备', popularity: 78, description: '打怪升级掉落装备的游戏化修仙', examples: ['《神秘之旅》'] },
      { name: '朝堂权谋', popularity: 75, description: '修真与朝堂斗争结合，修行与权术并行', examples: ['《将夜》', '《雪中悍刀行》'] },
      { name: '国术流', popularity: 70, description: '以现实存在的武术为基础进行夸张演绎', examples: ['《龙蛇演义》'] },
    ],
  },
  {
    genre: '都市',
    tags: [
      { name: '重生回到过去', popularity: 92, description: '主角重生回学生时代，利用先知先觉改变人生', examples: ['《重回1998》'] },
      { name: '神医/特种兵归来', popularity: 88, description: '退役兵王/神医回归都市，低调生活却被卷入风波', examples: ['《最强兵王》'] },
      { name: '商业帝国', popularity: 85, description: '白手起家建立商业帝国，商战博弈', examples: ['《大江东去》', '《猎场》'] },
      { name: '娱乐圈', popularity: 80, description: '在影视/音乐/选秀圈崛起的故事', examples: ['《全职艺术家》'] },
      { name: '悬疑推理', popularity: 78, description: '都市背景下的悬疑案件、推理破案', examples: ['《默读》', '《心理罪》'] },
      { name: '体育竞技', popularity: 72, description: '以某项体育运动为主题的竞技成长故事', examples: ['《全能运动员》'] },
    ],
  },
  {
    genre: '言情',
    tags: [
      { name: '穿越古言', popularity: 90, description: '穿越到古代，在宫廷/宅斗中寻求爱情与生存', examples: ['《步步惊心》', '《知否》'] },
      { name: '霸总爱上我', popularity: 88, description: '灰姑娘与霸道总裁的爱情故事', examples: ['《何以笙箫默》'] },
      { name: '双重生/双穿', popularity: 85, description: '双方都带着前世记忆重生，双向奔赴', examples: ['《长风渡》'] },
      { name: '校园纯爱', popularity: 82, description: '学生时代的清纯恋爱故事', examples: ['《最好的我们》'] },
      { name: '先婚后爱', popularity: 80, description: '因家族/利益联姻后逐渐产生真感情', examples: ['《贺新婚》'] },
    ],
  },
  {
    genre: '科幻',
    tags: [
      { name: '末世生存', popularity: 88, description: '末世降临（丧尸/天灾/核战），幸存者挣扎求生', examples: ['《末日乐园》'] },
      { name: '赛博朋克', popularity: 85, description: '高科技低生活，义体改造、网络空间、大公司统治', examples: ['《赛博英雄传》'] },
      { name: '星际争霸', popularity: 82, description: '星际时代的人类文明在宇宙中的征战', examples: ['《银河英雄传说》'] },
      { name: '时间循环', popularity: 78, description: '被困在时间循环中不断重生寻找出路', examples: ['《开端》'] },
      { name: 'AI觉醒', popularity: 75, description: '人工智能觉醒自我意识，人与AI的博弈', examples: [] },
    ],
  },
  {
    genre: '轻小说',
    tags: [
      { name: '异世界转生', popularity: 92, description: '死后转生到异世界，获得外挂能力', examples: ['《关于我转生变成史莱姆这档事》'] },
      { name: '学院/社团', popularity: 85, description: '以学校/社团为舞台的青春故事', examples: ['《春物》'] },
      { name: '日常系', popularity: 80, description: '轻松温馨的日常生活片段集合', examples: ['《轻音少女》'] },
    ],
  },
  {
    genre: '悬疑',
    tags: [
      { name: '无限流', popularity: 90, description: '主角进入不同副本世界完成任务，不断循环升级', examples: ['《无限恐怖》', '《惊悚乐园》'] },
      { name: '规则怪谈', popularity: 88, description: '在诡异规则下生存，找出规则漏洞才能活命', examples: ['《我在无限游戏里封神》'] },
      { name: '恐怖惊悚', popularity: 82, description: '灵异事件、恐怖氛围的悬疑解谜', examples: ['《我在精神病院学斩神》'] },
    ],
  },
]

export function getTrendingByGenre(genre?: string): TrendingCategory[] {
  if (!genre) return TRENDING_DATA
  return TRENDING_DATA.filter((c) => c.genre === genre)
}

export function getAllGenres(): string[] {
  return TRENDING_DATA.map((c) => c.genre)
}

export function getTopTrending(limit: number = 20): TrendingTag[] {
  const all = TRENDING_DATA.flatMap((c) => c.tags)
  return all.sort((a, b) => b.popularity - a.popularity).slice(0, limit)
}
