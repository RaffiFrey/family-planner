import { notificationLinkToRoute, parseInviteToken } from './links';

describe('parseInviteToken', () => {
  const token = 'abcDEF123_-xyz7890';
  it('accepts raw tokens and links', () => {
    expect(parseInviteToken(token)).toBe(token);
    expect(parseInviteToken(`familyplaner://join/${token}`)).toBe(token);
    expect(parseInviteToken(`https://app.familyplaner.de/invitations/${token}?x=1`)).toBe(token);
  });
  it('rejects garbage', () => {
    expect(parseInviteToken('')).toBeNull();
    expect(parseInviteToken('short')).toBeNull();
  });
});

describe('notificationLinkToRoute', () => {
  it('maps known paths', () => {
    expect(notificationLinkToRoute('/tasks/123')).toBe('/tasks/123');
    expect(notificationLinkToRoute('/lists/9')).toBe('/lists/9');
    expect(notificationLinkToRoute('/calendar/events/7')).toBe('/events/7');
    expect(notificationLinkToRoute('https://app.example.com/finance/budgets')).toBe(
      '/finance/budgets',
    );
    expect(notificationLinkToRoute(null)).toBe('/notifications');
    expect(notificationLinkToRoute('/whatever')).toBe('/notifications');
  });
});
