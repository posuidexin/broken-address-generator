# Broken 免费地址生成器

在线使用：[api.brokenalice.icu](https://api.brokenalice.icu/)

基于各国政府公开数据与开源数据集的随机地址生成器，支持 **🇭🇰 香港 / 🇯🇵 日本 / 🇺🇸 美国 / 🇸🇬 新加坡**。
纯静态网页，零构建、零后端、零运行时依赖，可直接部署到 GitHub Pages 或本地双击打开。

## 开源与公开范围

项目原创代码和文档按 [MIT License](LICENSE) 开源。公开数据各自遵循下方列出的原始许可与署名要求；根目录的 MIT 许可不替代第三方数据许可。Logo 不纳入 MIT 授权范围。

仓库只包含运行文件、可审阅的数据、构建与测试脚本；原始下载缓存、依赖、内部计划、未采用的设计草稿和发布目录均已排除。美国源数据中运行时不需要的 3,200 组精确经纬度已从公开数据文件移除，数据重建脚本也不再保存经纬度。保留的街道、城市、邮编及部分门牌来自公开数据，生成结果仍可能与真实信息重合。

> ⚠️ 仅供软件开发测试、表单验证与教育用途。街道/城镇及适用地区的邮编取自公开数据；部分美国完整街道地址和新加坡街区编号也来自公开资料。日本番地、香港门牌、其余美国门牌以及各地单元号、姓名和电话由程序随机组合。生成结果可能与真实地址或号码重合，不得用于寄送、联系或身份验证。香港没有邮编。

## 功能

- 四个国家/地区切换，数据按需懒加载（`data/*.js`），暗色玻璃拟态界面（自适应移动端）
- 区域筛选：日本 47 都道府县 / 香港 18 区 / 美国州 / 新加坡 27 市镇（可选「随机」），结果区上方常驻「当前地区」指示条防止选错地区
- 美国模式提供醒目的「免州级销售税州」快捷筛选，也可在州下拉中选择；范围为 AK、DE、MT、NH、OR。仅指一般州级销售税，阿拉斯加部分地区仍征收地方销售税
- 单条生成时自动放大展示（大字地址 + 大号字段标签），多条时紧凑网格排列
- 每条记录输出：本地文字地址（香港中文 / 日本日文 / 美国新加坡英文原生格式）+ 纯本地语言的结构化字段 + 本地姓名（含性别）+ 手机号（+国家码格式，复制即可粘贴；生成内容不含英文对照，英文备注仅保留在地区下拉中）
- 批量生成（1–50 条）、单字段复制、一键复制全部
- 收藏列表（localStorage 持久化）、导出 CSV（带 BOM）/ JSON

免州级销售税筛选口径核对于 2026-09-25：[2026 年各州销售税概览](https://taxfoundation.org/data/all/state/2026-sales-tax-rates-midyear/)；[阿拉斯加州地方销售税说明](https://www.commerce.alaska.gov/web/dcra/officeofthestateassessor/alaskataxfacts)。

## 数据来源

| 地区 | 来源 | 说明 |
|---|---|---|
| 日本 | [日本郵便 KEN_ALL](https://www.post.japanpost.jp/zipcode/)（UTF-8 镜像 [polm/posuto](https://github.com/polm/posuto)）+ [geolonia](https://github.com/geolonia/japanese-addresses-v2) 城市罗马字 | 47 都道府县 / 1892 市区町村 / 2.1 万町丁目，真实邮编 |
| 美国 | [EthanRBrown/rrad](https://github.com/EthanRBrown/rrad)（OpenAddresses 衍生，公有领域）+ [US-Zip-Codes-JSON](https://github.com/millbj92/US-Zip-Codes-JSON)（MIT） | 全部 50 州 + DC 覆盖：16 州真实门牌地址；其余州真实城市 + 真实邮编（大城市优先）配常见街道名 |
| 新加坡 | [data.gov.sg](https://data.gov.sg) HDB Property Information + [OneMap](https://github.com/xkjyeah/singapore-postal-codes) 邮编数据 | 27 市镇，每市镇至多 80 条经核实的街区、街道、邮编组合 + 商业地标 |
| 香港 | [data.gov.hk](https://data.gov.hk) 公开资料整理 | 18 区真实街道（中英双语）+ 知名大厦；不生成邮编 |

新加坡 [HDB Property Information](https://data.gov.sg/datasets/d_17f5382f26140b1fdae0ba2ef6239d2f/view) 数据由建屋发展局提供，本项目使用的副本于 2026 年 8 月取得；[OneMap 邮编资料](https://github.com/xkjyeah/singapore-postal-codes)用于街区、街道与邮编配对。二者依据 [Singapore Open Data Licence v1.0](https://data.gov.sg/open-data-licence) 使用。日本城市罗马字取自 [Geolonia japanese-addresses-v2](https://github.com/geolonia/japanese-addresses-v2) 并转换为本项目字段，按 [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/) 署名。不代表数据提供机构认可本项目。

美国邮编资料的 MIT 版权与许可声明保留于 [licenses/US-Zip-Codes-JSON-LICENSE.txt](licenses/US-Zip-Codes-JSON-LICENSE.txt)。

姓名库（各国常见姓氏/名字含转写）与电话号段规则内嵌于数据文件。

## 目录结构

```
├── index.html          # 单页应用
├── robots.txt / sitemap.xml # 搜索引擎发现入口
├── css/style.css
├── js/generator.js     # 核心生成器（纯函数）
├── js/app.js           # UI 交互
├── assets/broken-logo.png # 页眉与浏览器标签 Logo
├── data/*.js|*.json    # 各国数据（.js 供 file:// 协议懒加载）
├── licenses/           # 第三方数据许可声明
└── tools/
    ├── build-data.mjs  # 数据重建脚本（从 .cache 原始数据生成 data/*）
    ├── package-release.mjs # 生成仅含运行文件的 dist/
    ├── smoke-test.mjs  # 生成器冒烟测试
    ├── dom-test.mjs    # jsdom 端到端测试
    └── validate-100.mjs # 生成数据抽样及原始 OneMap 交叉验证
```

## 开发

```bash
# 重建数据（需先下载原始数据到 .cache/，见脚本头部注释）
node tools/build-data.mjs all

# 安装开发期测试依赖；运行网页本身不需要 npm
npm ci

# 测试
npm test
npm run test:data # 可选：需先准备 .cache/sg-buildings.json，核对 OneMap 原始数据

# 生成上线文件，然后上传 dist/ 内的全部内容到静态托管平台
npm run build

# 本地预览（也可直接双击 index.html）
npx http-server -p 8642
```

## 手机号段规则（仅生成手机号）

- **日本**：090/080/070 号段，输出 `+81 90 XXXX XXXX`
- **香港**：5/6/9 开头 8 位，输出 `+852 XXXX XXXX`
- **美国**：按州选取 NANP 区号，局号首位 2–9，输出 `+1 XXX XXX XXXX`
- **新加坡**：8/9 开头 8 位，输出 `+65 XXXX XXXX`

## 生成限制（客户端实现）

- 单次最多生成 **50** 条
- 滚动 1 小时窗口内最多 **30 次**生成、累计 **600** 条（localStorage 记录，超限提示剩余额度）

## 安全说明

- 所有动态内容经 `escapeHtml`/`escapeAttr` 转义后渲染；选项、指示条使用 `textContent`
- 不使用动态拼接的选择器（收藏删除按 `dataset.id` 逐一比对，天然免疫选择器注入）
- localStorage 解析全部 try/catch 包裹，损坏数据自动回退为空
- 纯静态、无第三方运行时 API 请求、无 eval；国家数据从同源静态文件加载。频率限制为客户端实现（防误用，非防绕过）
