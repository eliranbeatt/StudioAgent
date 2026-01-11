
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../export_unzipped/changeSets/documents.jsonl');

if (!fs.existsSync(filePath)) {
    console.error("File not found:", filePath);
    process.exit(1);
}

const content = fs.readFileSync(filePath, 'utf-8');
const lines = content.split('\n');
let lastId = null;

for (const line of lines) {
    if (!line.trim()) continue;
    try {
        const doc = JSON.parse(line);
        if (doc.reason_he && doc.reason_he.startsWith("טעינת נתוני פרויקט סקארה 26 (אוטומטי)") && doc.projectId === "nn7c921dndqc561fmq52hj79w17z0z92") {
            lastId = doc._id;
        }
    } catch (e) {
        // ignore
    }
}

if (lastId) {
    console.log(lastId);
    process.exit(0);
}
console.error("ChangeSet not found");
process.exit(1);
