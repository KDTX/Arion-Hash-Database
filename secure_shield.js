/**
 * KDT Secure Shield - Self-Protecting Security Engine
 * Provides file integrity, repair, and self-repair for Nova OS.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

// --- Self-Repair Wrapper ---
(async () => {
    try {
        // --- Core Functions ---

        async function fetchTrustedHashes({ owner, repo, path }) {
            const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
            const res = await fetch(url, {
                headers: { 'Accept': 'application/vnd.github.v3.raw' }
            });
            if (!res.ok) {
                throw new Error(`Github API error: ${res.status} ${res.statusText}`);
            }
            const content = await res.text();
            try {
                return JSON.parse(content);
            } catch (err) {
                throw new Error('Failed to parse trusted_hashes.json: ' + err.message);
            }
        }

        async function repairFile({ owner, repo, filename, localPath, backup = true }) {
            const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filename}`;
            try {
                const res = await fetch(url);
                if (!res.ok) {
                    throw new Error(`Failed to fetch ${filename} from the server: ${res.status} ${res.statusText}`);
                }
                const fileBuffer = await res.buffer();
                // Backup if requested and file exists
                if (backup && fs.existsSync(localPath)) {
                    fs.copyFileSync(localPath, localPath + '.bak');
                    console.log(`🗄️  Backup created: ${localPath}.bak`);
                }
                fs.writeFileSync(localPath, fileBuffer);
                console.log(`🔄 [REPAIR SUCCESS] ${localPath} replaced from server.`);
                return true;
            } catch (err) {
                console.log(`❌ [REPAIR FAILED] ${localPath}: ${err.message}`);
                return false;
            }
        }

        function retrieveAllFiles(dir_path, file_array = []) {
            const entries = fs.readdirSync(dir_path);
            for (const entry of entries) {
                const fullPath = path.join(dir_path, entry);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                    if (entry === 'node_modules' || entry === '.git') continue;
                    retrieveAllFiles(fullPath, file_array);
                } else {
                    file_array.push(fullPath);
                }
            }
            return file_array;
        }

        function generateFileHash(f_path) {
            return new Promise((resolve, reject) => {
                const hash = crypto.createHash('sha256');
                const stream = fs.createReadStream(f_path);
                stream.on('data', (chunk) => hash.update(chunk));
                stream.on('end', () => resolve(hash.digest('hex')));
                stream.on('error', (err) => reject(err));
            });
        }

        // --- Self-Integrity Check ---
        if (
            typeof fetchTrustedHashes !== 'function' ||
            typeof repairFile !== 'function' ||
            typeof retrieveAllFiles !== 'function' ||
            typeof generateFileHash !== 'function'
        ) {
            throw new Error('Critical Secure Shield function missing or corrupted!');
        }

        // --- Export for external use ---
        module.exports = {
            generateFileHash,
            retrieveAllFiles,
            fetchTrustedHashes,
            repairFile
        };

    } catch (err) {
        // --- Self-Repair Protocol ---
        console.error('[SECURE SHIELD ERROR]', err.message);
        try {
            const url = 'https://raw.githubusercontent.com/KDTX/Nova-System-Database/main/secure_shield.js';
            const res = await fetch(url);
            if (res.ok) {
                const fileBuffer = await res.buffer();
                fs.writeFileSync(__filename, fileBuffer);
                console.log('[SELF-REPAIR] secure_shield.js has been restored from trusted source.');
                // Optionally: process.exit(1); // Restart required after repair
            } else {
                console.error('[SELF-REPAIR FAILED] Could not fetch fresh secure_shield.js');
            }
        } catch (repairErr) {
            console.error('[SELF-REPAIR ERROR]', repairErr.message);
        }
    }
})();