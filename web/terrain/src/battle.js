// Geographic waypoints below are editorial schematic anchors, NOT archival tracks.
// Only unit identity, movement direction, phase ordering and cited events are historical claims.
export const sources = [
  {id:'history', title:'孟良崮战役：山地运动歼灭战的范例', publisher:'人民网 · 党史频道 / 学习时报', date:'2018-09-19', url:'http://dangshi.people.com.cn/n1/2018/0919/c85037-30301879.html', note:'潘金宽：战役日期、五纵围攻与四纵阻援、两翼穿插、5月15日13时总攻、16日下午战役结果。'},
  {id:'duozhuang',title:'粟裕决战孟良崮',publisher:'中国军网 / 学习时报',date:'2018-07-31',url:'http://www.81.cn/2018byzt/2018-07/31/content_8100152_2.htm',note:'王建柱：第1纵队穿插、第6纵队北上、5月15日拂晓攻占垛庄。'},
  {id:'terrain',title:'Terrain Tiles · Skadi N35E118',publisher:'AWS Open Data / Mapzen / Tilezen',url:'https://registry.opendata.aws/terrain-tiles/',note:'SRTM衍生现代高程；源栅格约30米，裁切后双线性重采样至257×257。非1947年地表复原。'},
  {id:'license',title:'Terrain Tiles 数据来源与署名',publisher:'Tilezen / USGS',url:'https://github.com/tilezen/joerd/blob/master/docs/attribution.md',note:'SRTM data courtesy of the U.S. Geological Survey. Terrain Tiles by Mapzen / Tilezen.'},
  {id:'geo',title:'垛庄镇 · 政区与地理',publisher:'蒙阴县人民政府 · 史志办',date:'2024-02-19',url:'http://www.mengyin.gov.cn/info/1073/28326.htm',note:'区位背景。图中地名为现代地理参考，部队位置、边界与箭线均为教学示意。'}
];

export const phases = [
  {date:'05.13',time:'13日晚',title:'两翼穿插',eyebrow:'01 / 穿插分割',summary:'从敌军战线中央，打开一道缺口。',body:'第1、第8纵队向整编第74师两翼穿插，切断其与左右邻的联系；第4、第9纵队在坦埠以南阻敌，并准备从正面进攻。',focus:'两翼迂回 · 正面牵制',sourceIds:['history'],camera:[21,19,27]},
  {date:'05.14',time:'14日',title:'向心合围',eyebrow:'02 / 压缩战场',summary:'穿越山地，形成内歼外阻之势。',body:'华东野战军由正面与两翼向孟良崮山区压迫，第6纵队由鲁南北上，向垛庄方向机动。外围另有第2、第3、第7、第10纵队担任阻援，本核心区沙盘不绘其具体阵位。',focus:'五纵围攻 · 四纵阻援',sourceIds:['history','duozhuang'],camera:[-18,18,24]},
  {date:'05.15',time:'15日拂晓',title:'截断退路',eyebrow:'03 / 封闭合围',summary:'垛庄，封闭合围的关键一环。',body:'第6纵队于15日拂晓攻占垛庄，截断整编第74师退路。第1、第8、第6纵队与正面攻击的第4、第9纵队共同形成包围。',focus:'第6纵队 · 攻占垛庄',sourceIds:['duozhuang','history'],camera:[-12,13,19]},
  {date:'05.15',time:'15日13时起',title:'多路总攻',eyebrow:'04 / 向心突击',summary:'山崮之间，多方向突击同时展开。',body:'5月15日13时总攻开始，五个纵队多路、多方向突击。当夜，整编第74师被压缩至520高地、芦山、雕窝一带的狭小地域。',focus:'多路突击 · 阻敌外援',sourceIds:['history'],camera:[13,12,16]},
  {date:'05.16',time:'16日下午',title:'战役胜利',eyebrow:'05 / 铭记胜利',summary:'山河为证，铭记军民共同的胜利。',body:'至5月16日下午，整编第74师被全歼，各阻援部队击退援敌。支前群众前运粮弹、后送伤员，为战役胜利作出重要贡献。此处以阶段叙事呈现，不模拟伤亡。',focus:'1947.05.13 — 05.16',sourceIds:['history'],camera:[18,23,28]}
];

export const units = [
  {id:'c1',name:'第1纵队',short:'1纵',side:'pla',role:'西翼穿插',detail:'由西翼向敌纵深穿插，切断整编第74师与其左邻的联系，再参加围歼。',source:'history',anchors:[[118.10,35.665],[118.115,35.625],[118.125,35.582],[118.16,35.58],[118.18,35.585]]},
  {id:'c8',name:'第8纵队',short:'8纵',side:'pla',role:'东翼穿插',detail:'由东翼向敌纵深穿插，切断整编第74师与其右邻的联系，形成向心合围。',source:'history',anchors:[[118.27,35.654],[118.26,35.615],[118.24,35.575],[118.211,35.571],[118.195,35.581]]},
  {id:'c4',name:'第4纵队',short:'4纵',side:'pla',role:'正面攻击',detail:'在坦埠以南阻止敌军进攻，由正面向孟良崮山区攻击。',source:'history',anchors:[[118.179,35.685],[118.175,35.66],[118.176,35.625],[118.183,35.601],[118.185,35.589]]},
  {id:'c9',name:'第9纵队',short:'9纵',side:'pla',role:'正面攻击',detail:'与第4纵队从正面牵制、攻击，与两翼及南面的部队形成合围。',source:'history',anchors:[[118.225,35.686],[118.23,35.651],[118.224,35.62],[118.205,35.603],[118.194,35.592]]},
  {id:'c6',name:'第6纵队',short:'6纵',side:'pla',role:'北上断后',detail:'由鲁南星夜北上，15日拂晓攻占垛庄，截断整编第74师退路。箭线仅表现由南向北的行动方向。',source:'duozhuang',anchors:[[118.114,35.502],[118.137,35.52],[118.158,35.545],[118.173,35.562],[118.182,35.575]]},
  {id:'d74',name:'整编第74师',short:'整74师',side:'kmt',role:'被围部队',detail:'在孟良崮山区遭到包围，后被压缩至狭小地域。5月16日下午被全歼。所绘范围不是精确防线。',source:'history',anchors:[[118.202,35.64],[118.198,35.617],[118.191,35.591],[118.19,35.585],[118.19,35.585]]}
];

export function sourceById(id) { return sources.find(s=>s.id===id); }
