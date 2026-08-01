const fs = require('fs');
let content = fs.readFileSync('src/services/file.service.ts', 'utf8');

if (!content.includes('import { decryptToken }')) {
  content = "import { decryptToken } from '../utils/crypto';\n" + content;
}

content = content.replace(/account\.accessToken(!?)/g, 'decryptToken(account.accessToken)$1');
content = content.replace(/account\.refreshToken/g, 'decryptToken(account.refreshToken)');

content = content.replace(/cloudAccount\.accessToken(!?)/g, 'decryptToken(cloudAccount.accessToken)$1');
content = content.replace(/cloudAccount\.refreshToken/g, 'decryptToken(cloudAccount.refreshToken)');

fs.writeFileSync('src/services/file.service.ts', content);
console.log('Patched');
