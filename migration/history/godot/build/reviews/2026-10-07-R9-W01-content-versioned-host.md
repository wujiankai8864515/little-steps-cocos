# R9-W01 Web宿主缓存身份

触发：已有HTML把actor_loading.js/preboot.js都写死为continuous-loading-v7；本轮preboot真实改动后，GitHub Pages max-age600的旧浏览器缓存可能继续运行旧硬等待逻辑。仅验证新文件SHA不足以让老URL缓存更新。

修复：官方Web组装器按实际每个脚本SHA写入各自host_revision查询，不改原脚本/图片/呈现顺序；未改actor继续复用缓存，已改preboot获得新身份。检查必须恰好一个对应引用，缺失/重复拒绝构建。9项确定性测试通过，覆盖实际seed、重复组装、只改变一个脚本与失败门槛。

边界：这保证新HTML请求对应脚本身份，不能强行刷新已打开的旧标签或保证CDN上的HTML瞬时更新。正式发布仍需逐文件HTTP读回，并核对实际HTML脚本URL。没有把该打包测试称为Web游戏运行/下载速度通过。
