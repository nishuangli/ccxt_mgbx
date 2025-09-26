#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const SYSTEM_DESIGN_DIR = path.join(__dirname, '..', 'system-design');

function validateMarkdownFiles() {
  console.log('🔍 Validating system design documentation...');
  
  const errors = [];
  
  // Check required files exist
  const requiredFiles = [
    'README.md',
    '_sidebar.md',
    'index.html',
    'docs/ccxt-architecture-overview.md',
    'docs/exchange-integration.md',
    'docs/rate-limiting-design.md',
    'docs/database-design.md',
    'templates/architecture-template.md',
    'templates/component-design-template.md',
    'templates/api-design-template.md'
  ];
  
  for (const file of requiredFiles) {
    const filePath = path.join(SYSTEM_DESIGN_DIR, file);
    if (!fs.existsSync(filePath)) {
      errors.push(`Missing required file: ${file}`);
    }
  }
  
  // Check markdown syntax basics
  const docsDir = path.join(SYSTEM_DESIGN_DIR, 'docs');
  if (fs.existsSync(docsDir)) {
    const mdFiles = fs.readdirSync(docsDir).filter(f => f.endsWith('.md'));
    
    for (const file of mdFiles) {
      const filePath = path.join(docsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      
      // Check for basic markdown structure
      if (!content.startsWith('#')) {
        errors.push(`${file}: Should start with a main heading (#)`);
      }
      
      // Check for minimal content
      if (content.length < 100) {
        errors.push(`${file}: File seems too short (${content.length} chars)`);
      }
    }
  }
  
  return errors;
}

function generateTableOfContents() {
  console.log('📝 Generating table of contents...');
  
  const docsDir = path.join(SYSTEM_DESIGN_DIR, 'docs');
  const templatesDir = path.join(SYSTEM_DESIGN_DIR, 'templates');
  
  let toc = '# System Design Documentation - Table of Contents\n\n';
  
  // Add docs
  if (fs.existsSync(docsDir)) {
    toc += '## Architecture Documents\n\n';
    const mdFiles = fs.readdirSync(docsDir)
      .filter(f => f.endsWith('.md'))
      .sort();
    
    for (const file of mdFiles) {
      const filePath = path.join(docsDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const firstLine = content.split('\n')[0];
      const title = firstLine.replace(/^#+\s*/, '');
      
      toc += `- [${title}](docs/${file})\n`;
    }
    toc += '\n';
  }
  
  // Add templates
  if (fs.existsSync(templatesDir)) {
    toc += '## Templates\n\n';
    const mdFiles = fs.readdirSync(templatesDir)
      .filter(f => f.endsWith('.md'))
      .sort();
    
    for (const file of mdFiles) {
      const filePath = path.join(templatesDir, file);
      const content = fs.readFileSync(filePath, 'utf8');
      const firstLine = content.split('\n')[0];
      const title = firstLine.replace(/^#+\s*/, '');
      
      toc += `- [${title}](templates/${file})\n`;
    }
    toc += '\n';
  }
  
  toc += '## Quick Links\n\n';
  toc += '- [Main CCXT Documentation](../wiki/)\n';
  toc += '- [Contributing Guidelines](../CONTRIBUTING.md)\n';
  toc += '- [GitHub Repository](https://github.com/ccxt/ccxt)\n';
  
  const tocPath = path.join(SYSTEM_DESIGN_DIR, 'table-of-contents.md');
  fs.writeFileSync(tocPath, toc);
  
  console.log(`✅ Generated table of contents: ${tocPath}`);
}

function main() {
  console.log('🚀 Building system design documentation...\n');
  
  // Validate files
  const errors = validateMarkdownFiles();
  
  if (errors.length > 0) {
    console.error('❌ Validation errors found:');
    errors.forEach(error => console.error(`  - ${error}`));
    process.exit(1);
  }
  
  console.log('✅ All required files are present and valid\n');
  
  // Generate additional files
  generateTableOfContents();
  
  console.log('\n🎉 System design documentation build completed successfully!');
  console.log('\nTo serve the documentation locally, run:');
  console.log('  npm run serve-system-design');
}

if (require.main === module) {
  main();
}

module.exports = { validateMarkdownFiles, generateTableOfContents };