const fs = require('node:fs');
const path = require('node:path');

const rawVersion = process.argv[2] || '';
const version = rawVersion.replace(/^v/i, '');
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('Release tag must use semantic versioning, for example v1.2.3.');
  process.exit(1);
}

for (const fileName of ['package.json', 'package-lock.json']) {
  const filePath = path.join(process.cwd(), fileName);
  const content = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  content.version = version;
  if (fileName === 'package-lock.json') {
    content.packages ||= {};
    content.packages[''] ||= {};
    content.packages[''].version = version;
  }
  fs.writeFileSync(filePath, `${JSON.stringify(content, null, 2)}\n`);
}
