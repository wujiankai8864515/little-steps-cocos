export interface Level {
    id: number; companyId: number; bossName: string; sceneName: string;
    gateCount: number; itemCount: number; encounterCount: number;
    bossSkillText: string; bossFailText: string; bossEnergy: number; reward: number;
}
export const COMPANIES = ['菊为', '藤训', '并夕夕', '自觉跳动', '呵里'];
export const COMPANY_TAGS = ['奋斗契约', '甩锅日常', '无限加班', '夺命节奏', '灵魂画饼'];
export const SKINS = [
    {id: 'default', name: '普通打工人', cost: 0, image: 'prepare_skin_preview_default', color: '#eee0bc'},
    {id: 'slacker', name: '带薪摸鱼王', cost: 120, image: 'prepare_skin_preview_slacker', color: '#708ca2'},
    {id: 'elite', name: '西装暴徒', cost: 280, image: 'prepare_skin_preview_elite', color: '#d3ae58'},
];
export const CARDS = [
    {id: 'spa', name: '做 SPA', energy: 200, price: 70, scene: 'spa', text: '两小时精油抚慰，班味随蒸汽一起消散。'},
    {id: 'beach', name: '马尔代夫躺平', energy: 400, price: 140, scene: 'travel', text: '纯白沙滩，碧海蓝天。今天只想慢慢呼吸。'},
    {id: 'savanna', name: '草原看角马迁徙', energy: 450, price: 160, scene: 'travel', text: '看百万角马奔腾，心胸一下变得辽阔。'},
    {id: 'balloon', name: '土耳其坐热气球', energy: 300, price: 110, scene: 'travel', text: '迎着日出飘在云端，烦恼都随风散去。'},
    {id: 'dolphin', name: '巴厘岛追海豚', energy: 300, price: 110, scene: 'travel', text: '乘风破浪与海豚共游，状态重回巅峰。'},
    {id: 'onsen', name: '北海道泡温泉', energy: 350, price: 125, scene: 'foot_spa', text: '雪山环绕，温泉暖身，卸下一身疲惫。'},
    {id: 'cat', name: '火锅与猫咪', energy: 200, price: 70, scene: 'feast', text: '火锅热气腾腾，猫咪软乎乎地蹭着手心。'},
    {id: 'family', name: '回家和爸妈吃饭', energy: 400, price: 140, scene: 'feast', text: '一桌家常菜，几句家常话，委屈就消失了。'},
    {id: 'iceland', name: '冰岛白日梦想家', energy: 450, price: 160, scene: 'sleep', text: '裹着毛毯等极光，在黑沙滩慢慢走。'},
    {id: 'stars', name: '皇后镇星空之约', energy: 400, price: 140, scene: 'sleep', text: '银河倾泻而下，亿万星辰像碎钻洒在身上。'},
];
export const ITEMS = {
    food: {name: '外卖套餐', tip: '吃饱喝好 · 精力 +30', good: true},
    fish: {name: '摸鱼神器', tip: '带薪摸鱼 · 无敌 10 秒', good: true},
    raise: {name: '升职加薪', tip: '金钱使人充满动力 · +100', good: true},
    ally: {name: '牛马同事', tip: '同事帮你背一次锅', good: true},
    lottery: {name: '中彩票了', tip: '财富自由 · 精力 +5000', good: true},
    overtime: {name: '无偿加班', tip: '下班别走 · 精力 -20', good: false},
    thief: {name: '内卷同事', tip: '下一次增益门会被抢走', good: false},
    block: {name: '需求被卡', tip: '停止前进 5 秒，计时继续', good: false},
    layoff: {name: '裁员预警', tip: '精力 -50 · 接下来两组门对调', good: false},
    fired: {name: '裁员', tip: '回到起点，保留剩余精力', good: false},
};
export type ItemId = keyof typeof ITEMS;
export const SHARE_LINES = ['上班唯唯诺诺，上线重拳出击', '今天，我终于把老板打了一顿……', '全网谁能比我更会收拾老板？', '这一战，为了不被压榨！', '打工人已经觉醒，老板瑟瑟发抖', '在打工和打盹之间选择了打架'];
export const DEPART_LINES = ['我替你跨过山川湖海，你替我好好照顾自己。', '你先好好上班，我替你私奔到宇宙。', '我走啦，去帮你把不开心都丢进风里。'];
export const RETURN_LINES = ['新西兰的车厘子好甜，你也尝尝。', '世界这么大，你不用一直低头赶路。', '老家来信：工作很辛苦，累了就回家。', '我路过老板工位，又替你收了一点窝囊费。'];
export const MAX_ENERGY = 99999;
export function clamp(value: number, min: number, max: number) { return Math.min(max, Math.max(min, value)); }
export function dayKey(time = Date.now()) { return new Date(time + 8 * 3600000).toISOString().slice(0, 10); }
export function random(seed: number) {
    let state = seed >>> 0 || 1;
    return () => { state ^= state << 13; state ^= state >>> 17; state ^= state << 5; return (state >>> 0) / 4294967296; };
}
export function validateLevels(data: any): Level[] {
    if (!data || !Array.isArray(data.levels) || data.levels.length !== 25) throw new Error('关卡数据不完整');
    return data.levels.map((v: any, i: number) => {
        if (v.id !== i + 1 || v.companyId !== Math.floor(i / 5) + 1 || !v.bossName ||
            !Number.isFinite(v.bossEnergy) || v.bossEnergy <= 0 || !Number.isInteger(v.gateCount) || v.gateCount < 1 ||
            !Number.isInteger(v.itemCount) || v.itemCount < 0 || !Number.isInteger(v.encounterCount) || v.encounterCount < 0 ||
            !Number.isFinite(v.reward) || v.reward < 0) throw new Error('关卡数据格式错误：' + (i + 1));
        return {...v};
    });
}
