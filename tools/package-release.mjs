// 生成可直接上传到静态托管平台的最小发布目录。
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dist = path.resolve(root, 'dist');
if (path.dirname(dist) !== root || path.basename(dist) !== 'dist') {
  throw new Error('发布目录不在项目根目录内');
}

const files = [
  'index.html',
  'robots.txt',
  'sitemap.xml',
  '681755064d119370c6a056bef4ef6128.txt',
  'css/style.css',
  'js/generator.js',
  'js/app.js',
  'data/hk.js',
  'data/jp.js',
  'data/us.js',
  'data/sg.js',
  'assets/broken-logo.png',
  'licenses/US-Zip-Codes-JSON-LICENSE.txt'
];

for (const file of files) {
  if (!fs.statSync(path.join(root, file)).isFile()) throw new Error(`缺少发布文件: ${file}`);
}
if (fs.existsSync(dist)) {
  const expected = path.join(fs.realpathSync(root), 'dist').toLowerCase();
  if (fs.realpathSync(dist).toLowerCase() !== expected) throw new Error('发布目录指向项目外部或其他目录');
}
fs.rmSync(dist, { recursive: true, force: true });
for (const file of files) {
  const target = path.join(dist, file);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(path.join(root, file), target);
}
console.log(`发布目录: ${dist}（${files.length} 个文件）`);
