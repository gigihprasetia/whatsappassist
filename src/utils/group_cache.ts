import fs from 'fs';
import path from 'path';
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const CACHE_FILE = path.join(__dirname, '../../data/known_groups.json');

// Ensure data directory exists
const dataDir = path.join(__dirname, '../../data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Initialize cache from file or create new one
let knownGroups: Set<string>;
try {
    const data = fs.readFileSync(CACHE_FILE, 'utf8');
    knownGroups = new Set(JSON.parse(data));
} catch (error) {
    knownGroups = new Set();
    fs.writeFileSync(CACHE_FILE, '[]');
}

export const addKnownGroup = (groupId: string): void => {
    knownGroups.add(groupId);
    fs.writeFileSync(CACHE_FILE, JSON.stringify(Array.from(knownGroups)));
};

export const isKnownGroup = (groupId: string): boolean => {
    return knownGroups.has(groupId);
};
