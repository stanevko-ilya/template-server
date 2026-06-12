import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import type { Request } from 'express';
import { keyGenerator } from '../../src/modules/api/middleware/userRateLimit.js';

describe('userRateLimit.keyGenerator', () => {
    const sign = (payload: object): string => jwt.sign(payload, 'test-secret');

    it('берёт sub из JWT', () => {
        const req = { headers: { authorization: `Bearer ${sign({ sub: 'user-1' })}` }, ip: '1.2.3.4' };
        expect(keyGenerator(req as Request)).toBe('u:user-1');
    });

    it('берёт id, если нет sub', () => {
        const req = { headers: { authorization: `Bearer ${sign({ id: 42 })}` }, ip: '1.2.3.4' };
        expect(keyGenerator(req as Request)).toBe('u:42');
    });

    it('берёт user_id, если нет sub/id', () => {
        const req = { headers: { authorization: `Bearer ${sign({ user_id: 'u9' })}` }, ip: '1.2.3.4' };
        expect(keyGenerator(req as Request)).toBe('u:u9');
    });

    it('падает на IP без токена', () => {
        expect(keyGenerator({ headers: {}, ip: '9.9.9.9' } as Request)).toBe('ip:9.9.9.9');
    });

    it('падает на IP при мусорном Bearer-токене', () => {
        const req = { headers: { authorization: 'Bearer not-a-jwt' }, ip: '9.9.9.9' };
        expect(keyGenerator(req as Request)).toBe('ip:9.9.9.9');
    });

    it('падает на IP при токене без id-полей', () => {
        const req = { headers: { authorization: `Bearer ${sign({ role: 'admin' })}` }, ip: '9.9.9.9' };
        expect(keyGenerator(req as Request)).toBe('ip:9.9.9.9');
    });
});
