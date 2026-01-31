import { describe, it, expectTypeOf } from 'vitest';
import type { Session, Message, User } from './api';

describe('API Types', () => {
  it('should have correct Session interface', () => {
    const session: Session = {
      id: '123',
      title: 'Test Session',
      user_id: 'u1',
      created_at: '2023-01-01',
      updated_at: '2023-01-01',
      messages: [] // Message[]
    };
    expectTypeOf(session).toBeObject();
    expectTypeOf(session.id).toBeString();
  });

  it('should have correct Message interface', () => {
    const message: Message = {
      id: 'msg_1',
      session_id: '123',
      role: 'user',
      content: 'Hello',
      timestamp: '2023-01-01'
    };
    expectTypeOf(message).toBeObject();
    expectTypeOf(message.role).toEqualTypeOf<'user' | 'assistant' | 'system' | 'model'>();
  });

  it('should have correct User interface', () => {
      const user: User = {
          id: 'u1',
          username: 'test',
          email: 'test@example.com'
      };
      expectTypeOf(user).toBeObject();
  })
});
