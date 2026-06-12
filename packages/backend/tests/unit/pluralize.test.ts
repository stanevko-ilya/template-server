import { describe, it, expect } from 'vitest';
import { pluralize, renderTemplate } from '../../src/functions/pluralize.js';

describe('pluralize', () => {
    const forms: [string, string, string] = ['элемент', 'элемента', 'элементов'];

    it('склоняет по правилам русского языка', () => {
        expect(pluralize(1, forms)).toBe('элемент');
        expect(pluralize(2, forms)).toBe('элемента');
        expect(pluralize(5, forms)).toBe('элементов');
        expect(pluralize(11, forms)).toBe('элементов'); // teens
        expect(pluralize(21, forms)).toBe('элемент');
        expect(pluralize(0, forms)).toBe('элементов');
    });

    it('renderTemplate подставляет {count} и {count_word}', () => {
        const out = renderTemplate('У вас {count} {count_word}', 3, { count_word: forms });
        expect(out).toBe('У вас 3 элемента');
    });

    it('renderTemplate вырезает {name}', () => {
        expect(renderTemplate('{name} привет', 1, {})).toBe('привет');
    });
});
