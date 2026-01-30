import { describe, it, expect } from 'vitest';
import { api, getSessions, createSession, sendMessage } from './api';

describe('API Client', () => {
    it('should export an axios instance', () => {
        expect(api).toBeDefined();
    });

    it('should export typed functions', () => {
        expect(getSessions).toBeTypeOf('function');
        expect(createSession).toBeTypeOf('function');
        expect(sendMessage).toBeTypeOf('function');
    });
});
