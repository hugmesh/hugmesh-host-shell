import {
  ACTIVE,
  ACTIVE_STATUS,
  BANNED,
  SUSPENDED,
  isCurtailed,
  normalizeStatus,
} from './account-status.model';

describe('account-status.model', () => {
  describe('isCurtailed', () => {
    it('is false for active', () => {
      expect(isCurtailed({ status: ACTIVE })).toBeFalse();
    });

    it('is true for suspended and banned', () => {
      expect(isCurtailed({ status: SUSPENDED })).toBeTrue();
      expect(isCurtailed({ status: BANNED })).toBeTrue();
    });

    it('FAILS OPEN for null/undefined/unknown (treated as not curtailed)', () => {
      expect(isCurtailed(null)).toBeFalse();
      expect(isCurtailed(undefined)).toBeFalse();
      // an unknown status string is not one of the two curtailed states
      expect(isCurtailed({ status: 'weird' as never })).toBeFalse();
    });
  });

  describe('normalizeStatus — defensive wire coercion', () => {
    it('passes through a well-formed suspended body with until + reason', () => {
      const s = normalizeStatus({
        status: 'suspended',
        until: '2026-07-01T00:00:00Z',
        reason: 'spam',
      });
      expect(s.status).toBe(SUSPENDED);
      expect(s.until).toBe('2026-07-01T00:00:00Z');
      expect(s.reason).toBe('spam');
    });

    it('passes through banned with no expiry', () => {
      const s = normalizeStatus({ status: 'banned', reason: 'tos' });
      expect(s.status).toBe(BANNED);
      expect(s.until).toBeUndefined();
      expect(s.reason).toBe('tos');
    });

    it('degrades an ABSENT status field to active (graceful)', () => {
      expect(normalizeStatus({ id: 'x', roles: [] }).status).toBe(ACTIVE);
    });

    it('degrades an UNKNOWN status value to active', () => {
      expect(normalizeStatus({ status: 'frozen' }).status).toBe(ACTIVE);
    });

    it('degrades a non-object body to active', () => {
      expect(normalizeStatus(null).status).toBe(ACTIVE);
      expect(normalizeStatus(undefined).status).toBe(ACTIVE);
      expect(normalizeStatus('boom').status).toBe(ACTIVE);
      expect(normalizeStatus(42).status).toBe(ACTIVE);
    });

    it('drops a non-string / empty until + reason', () => {
      const s = normalizeStatus({ status: 'suspended', until: 123, reason: '' });
      expect(s.status).toBe(SUSPENDED);
      expect(s.until).toBeUndefined();
      expect(s.reason).toBeUndefined();
    });
  });

  it('ACTIVE_STATUS is the active default', () => {
    expect(ACTIVE_STATUS.status).toBe(ACTIVE);
    expect(isCurtailed(ACTIVE_STATUS)).toBeFalse();
  });
});
