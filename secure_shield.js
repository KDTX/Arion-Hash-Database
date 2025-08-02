/**
 * @param {Object} options
 * @param {string} options.owner
 * @param {string} options.repo
 * @param {string} options.filename
 * @param {string} options.localPath
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');

async function fetchTrustedHashes({ owner, repo, path: filePath }) {
    try {
        const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;

        const res = await fetch(url, {
            headers: {
                'Accept': 'application/vnd.github.v3.raw'
            }
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
    } catch (err) {
        console.error(`❌ [ERROR] fetchTrustedHashes: ${err.message}`);
        return {};
    }
}

async function repairFile({ owner, repo, filename, localPath }) {
    try {
        const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filename}`;
        const res = await fetch(url);

        if (!res.ok) {
            throw new Error(`Failed to fetch ${filename} from the server: ${res.status} ${res.statusText}`);
        }

        const fileBuffer = await res.buffer();
        fs.writeFileSync(localPath, fileBuffer);
        console.log(`🔄 [REPAIR SUCCESS] ${localPath} replaced from server.`);
        return true;
    } catch (err) {
        console.error(`❌ [REPAIR FAILED] ${localPath}: ${err.message}`);
        return false;
    }
}

function retrieveAllFiles(dir_path, file_array = []) {
    try {
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
    } catch (err) {
        console.error(`❌ [ERROR] retrieveAllFiles: ${err.message}`);
        return file_array;
    }
}

function generateFileHash(f_path) {
    return new Promise((resolve, reject) => {
        try {
            const hash = crypto.createHash('sha256');
            const stream = fs.createReadStream(f_path);

            stream.on('data', (chunk) => {
                hash.update(chunk);
            });

            stream.on('end', () => {
                resolve(hash.digest('hex'));
            });

            stream.on('error', (err) => {
                reject(err);
            });
        } catch (err) {
            reject(err);
        }
    });
}

// === New: main scan + repair runner inside Secure Shield ===
async function runFullScan(systemRoot, options = {}) {
    const { owner, repo, repairSkipFiles = ['.gitignore', 'trusted_hashes.json'] } = options;

    try {
        const trustedHashes = await fetchTrustedHashes({
            owner,
            repo,
            path: 'trusted_hashes.json'
        });

        const files = retrieveAllFiles(systemRoot);

        for (const filePath of files) {
            const relativePath = path.relative(systemRoot, filePath).replace(/\\/g, '/');
            const filename = path.basename(filePath);

            try {
                const currentHash = await generateFileHash(filePath);
                const knownHash = trustedHashes[relativePath];

                if (!knownHash) {
                    console.warn(`⚠️  [UNREGISTERED] ${relativePath}`);
                    console.warn(`Please contact KDT Corporation for registering Critical System Files...`);
                } else if (currentHash !== knownHash) {
                    console.error(`❌ [MODIFIED] ${relativePath}`);

                    if (repairSkipFiles.includes(filename)) {
                        console.log(`[SKIP] Skipping the repair of ${relativePath}`);
                        continue;
                    }

                    console.log(`🛠️  Initiating repair of ${relativePath} file...`);

                    const repaired = await repairFile({
                        filename: relativePath,
                        owner,
                        repo,
                        localPath: filePath
                    });

                    if (repaired) {
                        console.log(`✅ [REPAIR SUCCESS] ${relativePath}`);
                    } else {
                        console.error(`❌ [REPAIR FAILED] ${relativePath}`);
                    }
                } else {
                    console.log(`✅ [CLEAN] ${relativePath}`);
                }
            } catch (err) {
                console.error(`❌ Error reading ${relativePath}: ${err.message}`);
            }
        }
    } catch (err) {
        console.error(`🚨 Critical failure in runFullScan: ${err.message}`);
    }
}

module.exports = {
    generateFileHash,
    retrieveAllFiles,
    fetchTrustedHashes,
    repairFile,
    runFullScan,
};
