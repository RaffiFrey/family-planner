import { isFeedUrl } from './feed-url';

describe('isFeedUrl', () => {
  it('accepts https and webcal feeds', () => {
    expect(isFeedUrl('https://example.com/cal.ics')).toBe(true);
    expect(isFeedUrl(' webcal://feeds.example.org/school?id=1 ')).toBe(true);
  });
  it('rejects other input', () => {
    expect(isFeedUrl('example.com/cal.ics')).toBe(false);
    expect(isFeedUrl('ftp://example.com/x.ics')).toBe(false);
    expect(isFeedUrl('https://localhost')).toBe(false);
  });
});
