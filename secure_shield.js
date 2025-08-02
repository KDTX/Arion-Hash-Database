"use strict";

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");

async function fetchTrustedHashes({ owner, repo, path: filePath }) {
  if (!owner || !repo || !filePath) {
    throw new Error("Invalid parameters for fetchTrustedHashes");
  }
  try {
    const url = `https://api.github.com/repos/${owner}/${repo}/contents/${filePath}`;
    const res = await fetch(url, {
      headers: { Accept: "application/vnd.github.v3.raw" },
    });
    if (!res.ok) {
      throw new Error(`GitHub API error: ${res.status} ${res.statusText}`);
    }
    const content = await res.text();
    return JSON.parse(content);
  } catch (error) {
    console.error(`[fetchTrustedHashes] Error: ${error.message}`);
    return {};
  }
}

async function repairFile({ owner, repo, filename, localPath }) {
  if (!owner || !repo || !filename || !localPath) {
    throw new Error("Invalid parameters for repairFile");
  }
  try {
    const url = `https://raw.githubusercontent.com/${owner}/${repo}/main/${filename}`;
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(
        `Failed to fetch ${filename} from server: ${res.status} ${res.statusText}`
      );
    }
    const buffer = await res.buffer();
    fs.writeFileSync(localPath, buffer);
    console.log(`[REPAIR SUCCESS] ${localPath} replaced from server.`);
    return true;
  } catch (error) {
    console.error(`[repairFile] Error: ${error.message}`);
    return false;
  }
}

function retrieveAllFiles(dir, fileList = []) {
  if (!dir) throw new Error("Directory path is required for retrieveAllFiles");
  try {
    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
      const fullPath = path.join(dir, entry);
      const stat = fs.statSync(fullPath);
      if (stat.isDirectory()) {
        if (entry === "node_modules" || entry === ".git") continue;
        retrieveAllFiles(fullPath, fileList);
      } else {
        fileList.push(fullPath);
      }
    }
    return fileList;
  } catch (error) {
    console.error(`[retrieveAllFiles] Error: ${error.message}`);
    return fileList;
  }
}

function generateFileHash(filePath) {
  return new Promise((resolve, reject) => {
    if (!filePath) {
      reject(new Error("File path is required for generateFileHash"));
      return;
    }
    try {
      const hash = crypto.createHash("sha256");
      const stream = fs.createReadStream(filePath);
      stream.on("data", (chunk) => hash.update(chunk));
      stream.on("end", () => resolve(hash.digest("hex")));
      stream.on("error", (err) => reject(err));
    } catch (error) {
      reject(error);
    }
  });
}

async function runFullScan(systemRoot, options = {}) {
  const { owner, repo, repairSkipFiles = [".gitignore", "trusted_hashes.json"] } =
    options;
  if (!systemRoot || !owner || !repo) {
    throw new Error("Invalid parameters for runFullScan");
  }
  try {
    const trustedHashes = await fetchTrustedHashes({
      owner,
      repo,
      path: "trusted_hashes.json",
    });
    const files = retrieveAllFiles(systemRoot);

    for (const filePath of files) {
      const relativePath = path.relative(systemRoot, filePath).replace(/\\/g, "/");
      const filename = path.basename(filePath);
      try {
        const currentHash = await generateFileHash(filePath);
        const knownHash = trustedHashes[relativePath];
        if (!knownHash) {
          console.warn(`[UNREGISTERED] ${relativePath}`);
          continue;
        }
        if (currentHash !== knownHash) {
          console.error(`[MODIFIED] ${relativePath}`);
          if (repairSkipFiles.includes(filename)) {
            console.log(`[SKIP] Skipping repair of ${relativePath}`);
            continue;
          }
          const repaired = await repairFile({
            owner,
            repo,
            filename: relativePath,
            localPath: filePath,
          });
          if (repaired) {
            console.log(`[REPAIR SUCCESS] ${relativePath}`);
          } else {
            console.error(`[REPAIR FAILED] ${relativePath}`);
          }
        } else {
          console.log(`[CLEAN] ${relativePath}`);
        }
      } catch (err) {
        console.error(`[Error processing ${relativePath}]: ${err.message}`);
      }
    }
  } catch (err) {
    console.error(`[runFullScan] Critical failure: ${err.message}`);
  }
}

async function main() {
  const systemRoot = path.resolve(__dirname, "../../..");
  try {
    await runFullScan(systemRoot, {
      owner: "KDTX",
      repo: "Nova-System-Database",
    });
  } catch (error) {
    console.error(`[main] Unhandled error: ${error.message}`);
  }
}

try {
  main();
} catch (fatal) {
  console.error(`[Fatal] Uncaught error: ${fatal.message}`);
  // Optional: trigger fallback or alert here
}

module.exports = {
  generateFileHash,
  retrieveAllFiles,
  fetchTrustedHashes,
  repairFile,
  runFullScan, 
};
