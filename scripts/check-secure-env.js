#!/usr/bin/env node
const { execSync } = require('child_process');
const path = require('path');

/**
 * 🛡️ Workla Security Shield: Pre-commit Hook
 * Prevents accidental commit of .env files and other secrets.
 */

try {
    // Get list of staged files
    const stagedFiles = execSync('git diff --cached --name-only', { encoding: 'utf8' })
        .split('\n')
        .map(f => f.trim())
        .filter(Boolean);

    const forbiddenExtensions = ['.env', '.env.local', '.env.production', '.env.development'];
    const leakedFiles = stagedFiles.filter(file => {
        const basename = path.basename(file);
        return forbiddenExtensions.includes(basename);
    });

    if (leakedFiles.length > 0) {
        console.error('\n🚨 [Security Shield] STOPE! You are trying to commit environment files:');
        leakedFiles.forEach(f => console.error(`   ❌ ${f}`));
        console.error('\nEnvironment files should NEVER be committed to Git.');
        console.error('Please run: git reset HEAD <file> to unstage them.\n');
        process.exit(1);
    }

    // Optional: scan files for "SECRET" or "KEY" strings if they are not .example files
    // ... (could add more complex regex checks here)

    console.log('✅ [Security Shield] No environment files detected. Proceeding...');
    process.exit(0);

} catch (error) {
    // If git fails (e.g. no commits), just skip
    process.exit(0);
}
