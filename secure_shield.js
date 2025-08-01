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

async function fetchTrustedHashes({owner, repo, path}){
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${path}`;

    const res = await fetch(url, {
        headers: {
            'Accept':'application/vnd.github.v3.raw'
        }
    });

    if (!res.ok){
        throw new Error(`Github API error: ${res.status} ${res.statusText}`);
    }

    const content = await res.text();

    try {
        return JSON.parse(content);
    } catch (err) {
        throw new Error('Failed to parshe thrusted_hashes.json', err.message)
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

function retrieveAllFiles(dir_path, file_array = []){
    const entries = fs.readdirSync(dir_path);

    for (const entry of entries){
        const fullPath = path.join(dir_path, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()){
            if (entry === 'node_modules' || entry === '.git') continue;
            retrieveAllFiles(fullPath, file_array);
        }else{
            file_array.push(fullPath);
        }
    }
    return file_array;
}

function generateFileHash(f_path){
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

module.exports = {generateFileHash, retrieveAllFiles, fetchTrustedHashes, repairFile};