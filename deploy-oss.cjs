/**
 * 阿里云 OSS 部署脚本
 * 
 * 使用方法：
 *   node deploy-oss.cjs
 * 
 * 首次使用需要配置环境变量或在下方填写 OSS 信息：
 *   OSS_REGION   - 地域，如 oss-cn-hangzhou
 *   OSS_BUCKET   - Bucket 名称
 *   OSS_AK       - AccessKey ID
 *   OSS_SK       - AccessKey Secret
 * 
 * 也可以创建 .env.oss 文件：
 *   OSS_REGION=oss-cn-hangzhou
 *   OSS_BUCKET=your-bucket-name
 *   OSS_AK=your-access-key-id
 *   OSS_SK=your-access-key-secret
 */

const OSS = require('ali-oss');
const path = require('path');
const fs = require('fs');

// ---------- 配置 ----------
const DIST_DIR = path.resolve(__dirname, 'dist');
const MAX_RETRIES = 3;

// 读取 .env.oss 文件
function loadEnvFile() {
  const envPath = path.resolve(__dirname, '.env.oss');
  if (fs.existsSync(envPath)) {
    const content = fs.readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const [key, ...rest] = trimmed.split('=');
      if (key && rest.length) {
        process.env[key.trim()] = rest.join('=').trim();
      }
    }
    console.log('✅ 已加载 .env.oss 配置');
  }
}
loadEnvFile();

const REGION = process.env.OSS_REGION;
const BUCKET = process.env.OSS_BUCKET;
const AK = process.env.OSS_AK;
const SK = process.env.OSS_SK;

if (!REGION || !BUCKET || !AK || !SK) {
  console.error('❌ 缺少必要配置！');
  console.error('');
  console.error('请通过以下任一方式提供配置：');
  console.error('  1. 创建 .env.oss 文件（推荐）：');
  console.error('     OSS_REGION=oss-cn-hangzhou');
  console.error('     OSS_BUCKET=your-bucket-name');
  console.error('     OSS_AK=your-access-key-id');
  console.error('     OSS_SK=your-access-key-secret');
  console.error('');
  console.error('  2. 设置环境变量：');
  console.error('     set OSS_REGION=oss-cn-hangzhou');
  console.error('     set OSS_BUCKET=your-bucket-name');
  console.error('     set OSS_AK=your-access-key-id');
  console.error('     set OSS_SK=your-access-key-secret');
  process.exit(1);
}

// ---------- OSS 客户端 ----------
const client = new OSS({
  region: REGION,
  bucket: BUCKET,
  accessKeyId: AK,
  accessKeySecret: SK,
  secure: true,
  timeout: 60000,
});

// ---------- MIME 类型映射 ----------
const MIME_MAP = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json',
  '.webp': 'image/webp',
  '.map': 'application/json',
};

function getMime(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_MAP[ext] || 'application/octet-stream';
}

// ---------- 缓存策略 ----------
function getCacheControl(filePath) {
  // 带 hash 的静态资源长期缓存
  if (/\.[a-f0-9]{8,}\.(js|css|woff2?|ttf|png|jpg|svg|webp)$/.test(filePath)) {
    return 'public, max-age=31536000, immutable';
  }
  // HTML 文件不缓存（确保更新及时）
  if (filePath.endsWith('.html')) {
    return 'no-cache, no-store, must-revalidate';
  }
  // SW 和 manifest 短缓存
  if (filePath.endsWith('sw.js') || filePath.endsWith('manifest.webmanifest')) {
    return 'no-cache, no-store, must-revalidate';
  }
  // 图标等中等缓存
  return 'public, max-age=86400';
}

// ---------- 收集文件 ----------
function collectFiles(dir, base = '') {
  const results = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = base ? `${base}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      results.push(...collectFiles(fullPath, relativePath));
    } else {
      results.push({ local: fullPath, remote: relativePath });
    }
  }
  return results;
}

// ---------- 上传单个文件（带重试）----------
async function uploadFile(file, retries = MAX_RETRIES) {
  const content = fs.readFileSync(file.local);
  const mime = getMime(file.local);
  const cache = getCacheControl(file.remote);

  const options = {
    headers: {
      'Content-Type': mime,
      'Cache-Control': cache,
    },
    timeout: 60000,
  };

  for (let i = 0; i < retries; i++) {
    try {
      const result = await client.put(file.remote, content, options);
      const size = (content.length / 1024).toFixed(1);
      console.log(`  ✅ ${file.remote} (${size}KB) [${mime.split(';')[0]}] [${cache.split(',')[0]}]`);
      return true;
    } catch (err) {
      if (i < retries - 1) {
        console.log(`  ⚠️  ${file.remote} 上传失败，重试 ${i + 1}/${retries}...`);
        await new Promise(r => setTimeout(r, 1000 * (i + 1)));
      } else {
        console.error(`  ❌ ${file.remote} 上传失败: ${err.message}`);
        return false;
      }
    }
  }
  return false;
}

// ---------- 主流程 ----------
async function main() {
  console.log('');
  console.log('🚀 录音即纪要 — OSS 部署工具');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log(`  地域: ${REGION}`);
  console.log(`  Bucket: ${BUCKET}`);
  console.log(`  源目录: ${DIST_DIR}`);
  console.log('');

  if (!fs.existsSync(DIST_DIR)) {
    console.error('❌ dist/ 目录不存在，请先运行 npm run build');
    process.exit(1);
  }

  const files = collectFiles(DIST_DIR);
  console.log(`📦 共 ${files.length} 个文件待上传\n`);

  let success = 0;
  let failed = 0;

  for (const file of files) {
    const ok = await uploadFile(file);
    if (ok) success++;
    else failed++;
  }

  console.log('');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  if (failed === 0) {
    console.log(`🎉 部署成功！${success} 个文件已上传`);
    console.log('');
    console.log(`  访问地址: https://${BUCKET}.${REGION}.oss-website-${REGION.replace('oss-', '')}.aliyuncs.com`);
    if (process.env.CUSTOM_DOMAIN) {
      console.log(`  自定义域名: https://${process.env.CUSTOM_DOMAIN}`);
    }
  } else {
    console.log(`⚠️  部分文件上传失败：${success} 成功, ${failed} 失败`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('❌ 部署出错:', err.message);
  process.exit(1);
});
