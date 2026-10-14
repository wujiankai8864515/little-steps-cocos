/* Native WeChat open-data context. Only real friend cloud scores are displayed. */
const canvas = wx.getSharedCanvas();
let width = 600, height = 700;
function base(message) {
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#102441'; ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff1c9'; ctx.font = '24px sans-serif'; ctx.textAlign = 'center';
  ctx.fillText(message, width / 2, height / 2); return ctx;
}
wx.onMessage(message => {
  if (message.type !== 'boss:rank') return;
  width = message.width || 600; height = message.height || 700;
  base('正在读取好友战绩…');
  wx.getFriendCloudStorage({keyList: ['boss-cleared', 'boss-earned'], success(result) {
    const rows = result.data.map(user => {
      const values = {}; user.KVDataList.forEach(pair => values[pair.key] = Number(pair.value) || 0);
      return {name: user.nickname || '微信好友', cleared: values['boss-cleared'] || 0, earned: values['boss-earned'] || 0};
    }).sort((a, b) => b.cleared - a.cleared || b.earned - a.earned);
    const ctx = base(rows.length ? '' : '还没有好友战绩，一起开跑吧');
    ctx.textAlign = 'left'; ctx.fillStyle = '#ffd16c'; ctx.font = '22px sans-serif';
    ctx.fillText('好友', 35, 50); ctx.fillText('通关', 350, 50); ctx.fillText('窝囊费', 450, 50);
    rows.slice(0, 8).forEach((row, i) => {
      const y = 115 + i * 68;
      ctx.fillStyle = '#fff1c9'; ctx.fillText((i + 1) + '  ' + row.name.slice(0, 9), 35, y);
      ctx.fillStyle = '#67d6c5'; ctx.fillText(String(row.cleared), 367, y);
      ctx.fillStyle = '#ffd16c'; ctx.fillText(String(row.earned), 450, y);
    });
  }, fail() {base('好友榜暂不可用，请稍后再试');}});
});
