/**
 * 构建后脚本：把落地页 + 图标复制到 dist/ 根目录
 * 
 * 最终 dist/ 结构：
 *   dist/
 *     index.html          ← 落地页
 *     icon-512.png         ← 图标
 *     icon-192.png         ← 图标
 *     favicon.ico          ← favicon
 *     app/                 ← 应用（Vite 构建产物）
 *       index.html
 *       assets/
 *       manifest.webmanifest
 *       ...
 */

const fs = require('fs');
const path = require('path');

const root = __dirname;
const distDir = path.join(root, 'dist');

// 确保 dist 根目录存在
if (!fs.existsSync(distDir)) {
  fs.mkdirSync(distDir, { recursive: true });
}

// 复制落地页
const landingSrc = path.join(root, 'landing.html');
const landingDst = path.join(distDir, 'index.html');
if (fs.existsSync(landingSrc)) {
  fs.copyFileSync(landingSrc, landingDst);
  console.log('✅ 复制 landing.html → dist/index.html');
} else {
  console.warn('⚠️ landing.html 不存在，跳过');
}

// 复制图标
const icons = ['icon-512.png', 'icon-192.png'];
for (const icon of icons) {
  // 优先从 public/ 找，然后从根目录找
  const src1 = path.join(root, 'public', icon);
  const src2 = path.join(root, icon);
  const src = fs.existsSync(src1) ? src1 : fs.existsSync(src2) ? src2 : null;
  if (src) {
    fs.copyFileSync(src, path.join(distDir, icon));
    console.log(`✅ 复制 ${icon} → dist/${icon}`);
  } else {
    console.warn(`⚠️ ${icon} 不存在，跳过`);
  }
}

// 复制 favicon
const faviconSrc = path.join(root, 'public', 'favicon.ico');
if (fs.existsSync(faviconSrc)) {
  fs.copyFileSync(faviconSrc, path.join(distDir, 'favicon.ico'));
  console.log('✅ 复制 favicon.ico → dist/favicon.ico');
}

console.log('\n🎉 构建完成！dist/ 目录结构：');
console.log('   dist/index.html        ← 落地页');
console.log('   dist/app/              ← 应用');
console.log('   dist/icon-*.png        ← 图标');
