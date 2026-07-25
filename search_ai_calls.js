const fs = require('fs');

const file = 'c:\\Users\\91798\\Downloads\\vigozen-src\\src\\app\\pages\\AnalysisPage.tsx';
const content = fs.readFileSync(file, 'utf8');
const lines = content.split('\n');

console.log('=== AI search in AnalysisPage.tsx ===');
lines.forEach((line, idx) => {
  if (line.toLowerCase().includes('insight') || line.toLowerCase().includes('ai')) {
    if (!line.includes('import ') && !line.includes('//')) {
      console.log(`Line ${idx + 1}: ${line.trim()}`);
    }
  }
});
