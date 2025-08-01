/**
 * Secure Shield - Zombie Mode Self-Repairing Security Engine
 * If any function fails, Secure Shield enters "Zombie Mode" and repairs itself.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

const SELF_URL = 'https://raw.githubusercontent.com/KDTX/Nova-System-Database/main/secure_shield.js';

// --- Self-Repair Logic ---
async function selfRepair() {
    try {
        const res = await fetch(SELF_URL);
        if (!res.ok) throw new Error('Failed to fetch self-repair file');
        const buffer = await res.buffer();
        fs.writeFileSync(__filename, buffer);
        console.log('[ZOMBIE MODE] Secure Shield repaired itself!');
        // Optionally: process.exit(1);
    } catch (err) {
        console.error('[ZOMBIE MODE] Self-repair failed:', err.message);
    }
}

// --- Zombie Wrapper ---
function zombieWrap(fn) {
    return async function(...args) {
        try {
            return await fn(...args);
        } catch (err) {
            console.error('[ZOMBIE MODE] Secure Shield error:', err.message);
            await selfRepair();
            throw err;
        }
    };
}

// --- Core Functions ---

async function fetchTrustedHashes({owner, repo, path}) {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;
    const res = await fetch(url, {
        headers: { 'Accept':'application/vnd.github.v3.raw' }
    });
    if (!res.ok){
        throw new Error(`Github API error: ${res.status} ${res.statusText}`);
    }
    const content = await res.text();
    try {
        return JSON.parse(content);
    } catch (err) {
        throw new Error('Failed to parse trusted_hashes.json: ' + err.message);
    }
}

async function repairFile({owner, repo, filename, localPath}) {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filename}`;
    try {
        const res = await fetch(url);
        if(!res.ok){
            throw new Error(`Failed to fetch ${filename} from the server: ${res.status} ${res.statusText}`);
        }
        const fileBuffer = await res.buffer();
        fs.writeFileSync(localPath, fileBuffer);
        console.log(`🔄 [REPAIR SUCCESS] ${localPath} replaced from server.`);
        return true;
    } catch (err) {
        console.log(`❌ [REPAIR FAILED] ${localPath}: ${err.message}`);
        return false;
    }
}

function retrieveAllFiles(dir_path, file_array) {
    // Always return an array, even if dir_path is invalid
    if (!file_array) file_array = [];
    let entries;
    try {
        entries = fs.readdirSync(dir_path);
    } catch (err) {
        // Directory does not exist or is not accessible
        return file_array;
    }
    for (const entry of entries){
        const fullPath = path.join(dir_path, entry);
        let stat;
        try {
            stat = fs.statSync(fullPath);
        } catch (err) {
            // Skip files that can't be accessed
            continue;
        }
        if (stat.isDirectory()){
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

        stream.on('data', (chunk) => {
            hash.update(chunk);
        });

        stream.on('end', ()=>{
            resolve(hash.digest('hex'));
        });

        stream.on('error', (err) => {
            reject(err);
        });
    });
}

// --- Export Zombie-Wrapped Functions ---
module.exports = {
    generateFileHash: zombieWrap(generateFileHash),
    retrieveAllFiles: zombieWrap(retrieveAllFiles),
    fetchTrustedHashes: zombieWrap(fetchTrustedHashes),
    repairFile: zombieWrap(repairFile)
};

// --- Global Zombie Catch (last resort) ---
process.on('uncaughtException', async (err) => {
    console.error('[ZOMBIE MODE] Uncaught exception:', err.message);
    await selfRepair();
});