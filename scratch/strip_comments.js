const fs = require('fs');
const path = require('path');

// Directories to process
const dirs = [
  path.join(__dirname, '..', 'MyApp', 'src'),
  path.join(__dirname, '..', 'backend', 'src'),
];

const extensions = ['.tsx', '.ts', '.js'];

function getAllFiles(dir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;
  const items = fs.readdirSync(dir);
  for (const item of items) {
    const full = path.join(dir, item);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      if (item === 'node_modules' || item === '.git') continue;
      results = results.concat(getAllFiles(full));
    } else if (extensions.includes(path.extname(full))) {
      results.push(full);
    }
  }
  return results;
}

function stripComments(content) {
  const lines = content.split('\n');
  const result = [];
  let inBlockComment = false;
  let prevWasBlank = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i];

    // Handle block comments
    if (inBlockComment) {
      const endIdx = line.indexOf('*/');
      if (endIdx !== -1) {
        inBlockComment = false;
        line = line.substring(endIdx + 2);
        if (line.trim() === '') continue;
      } else {
        continue;
      }
    }

    // Check for block comment start (but not inside strings)
    const blockStart = line.indexOf('/*');
    if (blockStart !== -1) {
      // Make sure it's not inside a string
      const before = line.substring(0, blockStart);
      const singleQuotes = (before.match(/'/g) || []).length;
      const doubleQuotes = (before.match(/"/g) || []).length;
      const backticks = (before.match(/`/g) || []).length;
      const inString = (singleQuotes % 2 !== 0) || (doubleQuotes % 2 !== 0) || (backticks % 2 !== 0);
      
      if (!inString) {
        const endIdx = line.indexOf('*/', blockStart + 2);
        if (endIdx !== -1) {
          // Single-line block comment
          line = line.substring(0, blockStart) + line.substring(endIdx + 2);
          if (line.trim() === '') continue;
        } else {
          // Multi-line block comment starts
          line = line.substring(0, blockStart);
          inBlockComment = true;
          if (line.trim() === '') continue;
        }
      }
    }

    // Check for JSX comments {/* ... */}
    const jsxCommentMatch = line.match(/^(\s*)\{\/\*.*\*\/\}\s*$/);
    if (jsxCommentMatch) {
      continue;
    }

    // Check for single-line comments
    const trimmed = line.trim();
    
    // Full-line comment (line starts with //)
    if (trimmed.startsWith('//')) {
      continue;
    }

    // Inline comment at end of line - remove it carefully
    // Look for // that's not inside a string
    let cleaned = line;
    let inSingleStr = false;
    let inDoubleStr = false;
    let inTemplateLit = false;
    let commentIdx = -1;
    
    for (let j = 0; j < line.length - 1; j++) {
      const ch = line[j];
      const next = line[j + 1];
      
      if (ch === '\\') { j++; continue; } // skip escaped chars
      
      if (!inDoubleStr && !inTemplateLit && ch === "'") inSingleStr = !inSingleStr;
      else if (!inSingleStr && !inTemplateLit && ch === '"') inDoubleStr = !inDoubleStr;
      else if (!inSingleStr && !inDoubleStr && ch === '`') inTemplateLit = !inTemplateLit;
      
      if (!inSingleStr && !inDoubleStr && !inTemplateLit && ch === '/' && next === '/') {
        // Check it's not a URL (http:// https://)
        if (j > 0 && line[j-1] === ':') continue;
        commentIdx = j;
        break;
      }
    }
    
    if (commentIdx !== -1) {
      cleaned = line.substring(0, commentIdx).trimEnd();
      if (cleaned.trim() === '') continue;
    }

    // Collapse multiple blank lines
    if (cleaned.trim() === '') {
      if (prevWasBlank) continue;
      prevWasBlank = true;
    } else {
      prevWasBlank = false;
    }

    result.push(cleaned);
  }

  // Remove trailing blank lines
  while (result.length > 0 && result[result.length - 1].trim() === '') {
    result.pop();
  }

  return result.join('\n') + '\n';
}

// Process all files
let totalFiles = 0;
let totalCommentsRemoved = 0;

for (const dir of dirs) {
  const files = getAllFiles(dir);
  for (const file of files) {
    const original = fs.readFileSync(file, 'utf-8');
    const stripped = stripComments(original);
    
    const origLines = original.split('\n').length;
    const newLines = stripped.split('\n').length;
    const diff = origLines - newLines;
    
    if (diff > 0) {
      fs.writeFileSync(file, stripped, 'utf-8');
      console.log(`${path.relative(path.join(__dirname, '..'), file)}: removed ${diff} lines`);
      totalFiles++;
      totalCommentsRemoved += diff;
    }
  }
}

console.log(`\nDone! Processed ${totalFiles} files, removed ${totalCommentsRemoved} comment/blank lines total.`);
