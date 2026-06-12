import type { PluralForms } from '../../functions/pluralize.js';

export interface NotifierConfig {
    timezone_offset_hours: number;
    concurrency: number;
    cursor_batch_size: number;
    names_chunk_size: number;
    default_rps: number;
    default_batch_size: number;
    pluralize: Record<string, PluralForms>;
    use?: boolean;
}

const config = {
    timezone_offset_hours: 3,

    concurrency: 30,
    cursor_batch_size: 5000,
    names_chunk_size: 5000,

    default_rps: 250,
    default_batch_size: 100,

    pluralize: {
        count_word: ['элемент', 'элемента', 'элементов'] as PluralForms,
    },
} satisfies NotifierConfig;

export default config;
