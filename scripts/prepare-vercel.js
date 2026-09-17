const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const source = path.join(root, 'frontend');
const target = path.join(root, 'public');

if (!fs.existsSync(source)) {
  throw new Error(`Frontend directory not found: ${source}`);
}

fs.rmSync(target, { recursive: true, force: true });
fs.cpSync(source, target, { recursive: true });

// Keep Vercel's generated static output free of local-only metadata.
for (const file of ['.gitignore']) {
  fs.rmSync(path.join(target, file), { force: true });
}

console.log(`Prepared Vercel static frontend: ${path.relative(root, target)}`);
