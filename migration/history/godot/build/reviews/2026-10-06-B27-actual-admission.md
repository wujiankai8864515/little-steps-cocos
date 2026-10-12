# B27-G01：真实资源门禁核查

在 c242 原正式9包基础，仅替换 B27 两脚本和暗室背景的 TEST-ONLY 小候选，从空 res 根启动生产 App、PackService、ResourceLoader 与 Gate。此候选用于源码预检，不是正式下一组部署包。

真实冷 Home 没有先挂 travel/photo/departure；随后保留全部八逻辑组的 lease，共128个资源，生产 Gate 实际记录268,344,204 bytes预估预留，余91,252 bytes，22项核查通过，日志零错误。硬限制仍128/256MiB/80spec。全部9包的真实bytes/hash、命令及结果见 build/darkroom_edges/actual_gate_admission.json。

此处核实的是生产准入行为及真实资源可加载，不是物理RAM、GPU或Web内存，不能把91KB算成浏览器可用内存。正式关联组仍须远端核验之后同源构建，再核实际Home19MB/冷入口/高屏画面。没有因此放宽上限或压缩认可原画。
