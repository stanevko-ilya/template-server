import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import directorySearch from '../../src/functions/directorySearch.js';

describe('directorySearch deep flag', () => {
    let root: string;

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'));
        // root/index.js  и  root/nested/index.js
        fs.writeFileSync(path.join(root, 'index.js'), '');
        fs.mkdirSync(path.join(root, 'nested'));
        fs.writeFileSync(path.join(root, 'nested', 'index.js'), '');
    });

    afterAll(() => {
        fs.rmSync(root, { recursive: true, force: true });
    });

    it('deep=false: останавливается на первом найденном файле', () => {
        const found = directorySearch(root, 'index.js', false);
        expect(found.length).toBe(1);
    });

    it('deep=true: спускается в подкаталоги после находки', () => {
        const found = directorySearch(root, 'index.js', true);
        expect(found.length).toBe(2);
    });
});
