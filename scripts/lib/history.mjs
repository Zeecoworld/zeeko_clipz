import fs from 'node:fs';
import path from 'node:path';

// A small file in the repository remembers recent topics so the factory does not repeat itself.
export const loadHistory = (file) => {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (err) {
    return [];
  }
};

export const saveHistory = (file, entries) => {
  fs.mkdirSync(path.dirname(file), {recursive: true});
  fs.writeFileSync(file, `${JSON.stringify(entries.slice(-300), null, 2)}\n`);
};
