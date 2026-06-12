import { describe, it, expect } from 'vitest';
import { getMskDateKey, filterNotSent, markSent, saveNotificationLog } from '../../src/functions/notifierHelpers.js';
import type { Modules } from '../../src/modules.js';

/**
 * Фейковый ioredis-клиент с pipeline(): накапливает команды и возвращает
 * результат в формате ioredis ([err, result]). Состояние «отправленных» — в sentSet.
 */
function fakeCacheClient(sentSet = new Set<string>()) {
    const commands: Array<[string, unknown]> = [];
    return {
        commands,
        pipeline() {
            const queued: Array<[string, unknown]> = [];
            const api = {
                sismember(_key: string, id: string) {
                    queued.push(['sismember', String(id)]);
                    return api;
                },
                sadd(_key: string, id: string) {
                    queued.push(['sadd', String(id)]);
                    return api;
                },
                expire(_key: string, ttl: number) {
                    queued.push(['expire', ttl]);
                    return api;
                },
                async exec() {
                    return queued.map(([cmd, arg]) => {
                        commands.push([cmd, arg]);
                        if (cmd === 'sismember') return [null, sentSet.has(arg as string) ? 1 : 0];
                        if (cmd === 'sadd') {
                            sentSet.add(arg as string);
                            return [null, 1];
                        }
                        return [null, 1];
                    });
                },
            };
            return api;
        },
    };
}

describe('notifierHelpers.getMskDateKey', () => {
    it('возвращает дату в формате YYYY-MM-DD', () => {
        expect(getMskDateKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('сдвиг таймзоны не уменьшает дату (+3ч ≥ UTC)', () => {
        const utc = getMskDateKey(0);
        const msk = getMskDateKey(3);
        expect(utc).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(msk >= utc).toBe(true);
    });
});

describe('notifierHelpers.filterNotSent', () => {
    it('отфильтровывает уже отправленные id', async () => {
        const modules = { cache: { client: fakeCacheClient(new Set(['2'])) } } as unknown as Modules;
        expect(await filterNotSent(modules, 'set:k', [1, 2, 3])).toEqual([1, 3]);
    });

    it('без cache возвращает исходный список', async () => {
        expect(await filterNotSent({ cache: {} } as unknown as Modules, 'set:k', [1, 2, 3])).toEqual([1, 2, 3]);
    });

    it('пустой список — без обращения к Redis', async () => {
        const client = fakeCacheClient();
        expect(await filterNotSent({ cache: { client } } as unknown as Modules, 'set:k', [])).toEqual([]);
        expect(client.commands).toHaveLength(0);
    });
});

describe('notifierHelpers.markSent', () => {
    it('добавляет id в сет и ставит TTL 24ч', async () => {
        const sent = new Set<string>();
        const client = fakeCacheClient(sent);
        await markSent({ cache: { client } } as unknown as Modules, 'set:k', [1, 2]);
        expect(sent.has('1')).toBe(true);
        expect(sent.has('2')).toBe(true);
        expect(client.commands).toContainEqual(['expire', 86400]);
    });

    it('без cache — no-op (не бросает)', async () => {
        await expect(markSent({ cache: {} } as unknown as Modules, 'set:k', [1])).resolves.toBeUndefined();
    });
});

describe('notifierHelpers.saveNotificationLog', () => {
    function fakeDb() {
        const state: { doc?: any } = {};
        return {
            state,
            modules: {
                db: {
                    models: {
                        'notification-log': {
                            create: async (doc: any) => {
                                state.doc = doc;
                                return doc;
                            },
                        },
                    },
                },
            } as unknown as Modules,
        };
    }

    it('создаёт запись с корректными полями и duration_ms', async () => {
        const { state, modules } = fakeDb();
        const startedAt = new Date(Date.now() - 1000);
        await saveNotificationLog(modules, 'heartbeat', 'web', {
            startedAt,
            totalSent: 10,
            totalErrors: 2,
            errors: new Set(['e1', 'e2']),
        });
        expect(state.doc.job_name).toBe('heartbeat');
        expect(state.doc.platform).toBe('web');
        expect(state.doc.status).toBe('completed');
        expect(state.doc.total_sent).toBe(10);
        expect(state.doc.total_errors).toBe(2);
        expect(state.doc.started_at).toBe(startedAt);
        expect(state.doc.completed_at).toBeInstanceOf(Date);
        expect(state.doc.duration_ms).toBeGreaterThanOrEqual(1000);
        expect(state.doc.error_message).toBe('e1 | e2');
    });

    it('пустые errors → error_message = null', async () => {
        const { state, modules } = fakeDb();
        await saveNotificationLog(modules, 'job', 'web', { totalSent: 1, totalErrors: 0, errors: new Set() });
        expect(state.doc.error_message).toBeNull();
    });

    it('нет модели notification-log — no-op (не бросает)', async () => {
        await expect(
            saveNotificationLog({ db: { models: {} } } as unknown as Modules, 'job', 'web', {
                totalSent: 0,
                totalErrors: 0,
            }),
        ).resolves.toBeUndefined();
    });
});
