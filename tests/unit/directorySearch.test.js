const fs = require('fs');
const os = require('os');
const path = require('path');
const directorySearch = require('../../functions/directorySearch');

describe('directorySearch deep flag', () => {
    let root;

    beforeAll(() => {
        root = fs.mkdtempSync(path.join(os.tmpdir(), 'ds-'));
        // root/index.js  и  root/nested/index.js
        fs.writeFileSync(path.join(root, 'index.js'), '');
        fs.mkdirSync(path.join(root, 'nested'));
        fs.writeFileSync(path.join(root, 'nested', 'index.js'), '');
    });

    afterAll(() => { fs.rmSync(root, { recursive: true, force: true }); });

    it('deep=false: останавливается на первом найденном файле', () => {
        const found = [];
        directorySearch(root, p => found.push(p), 'index.js', false);
        expect(found.length).toBe(1);
    });

    it('deep=true: спускается в подкаталоги после находки', () => {
        const found = [];
        directorySearch(root, p => found.push(p), 'index.js', true);
        expect(found.length).toBe(2);
    });
});
