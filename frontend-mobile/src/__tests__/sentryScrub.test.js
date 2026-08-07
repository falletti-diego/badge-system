const { scrubBreadcrumb, scrubEvent } = require('../utils/sentryScrub');

describe('sentryScrub', () => {
  test('scrubBreadcrumb redige una chiave Authorization di primo livello in breadcrumb.data', () => {
    const breadcrumb = { category: 'xhr', data: { url: '/api/v1/checkins', Authorization: 'Bearer secret-token' } };

    const result = scrubBreadcrumb(breadcrumb);

    expect(result.data.Authorization).toBe('[Filtered]');
    expect(result.data.url).toBe('/api/v1/checkins');
  });

  test('scrubBreadcrumb redige gli header annidati sotto breadcrumb.data.headers', () => {
    const breadcrumb = { category: 'fetch', data: { headers: { authorization: 'Bearer secret-token', 'content-type': 'application/json' } } };

    const result = scrubBreadcrumb(breadcrumb);

    expect(result.data.headers.authorization).toBe('[Filtered]');
    expect(result.data.headers['content-type']).toBe('application/json');
  });

  test('scrubBreadcrumb non fa nulla se la breadcrumb non ha data', () => {
    const breadcrumb = { category: 'navigation' };

    expect(scrubBreadcrumb(breadcrumb)).toEqual(breadcrumb);
  });

  test('scrubEvent redige gli header sensibili della richiesta', () => {
    const event = { request: { headers: { authorization: 'Bearer secret-token', 'user-agent': 'BadgeApp/1.0' } } };

    const result = scrubEvent(event);

    expect(result.request.headers.authorization).toBe('[Filtered]');
    expect(result.request.headers['user-agent']).toBe('BadgeApp/1.0');
  });

  test('scrubEvent redige le chiavi sensibili nel body della richiesta', () => {
    const event = { request: { data: { password: 'hunter2', email: 'a@b.com' } } };

    const result = scrubEvent(event);

    expect(result.request.data.password).toBe('[Filtered]');
    expect(result.request.data.email).toBe('a@b.com');
  });

  test('scrubEvent non fa nulla se l\'evento non ha request', () => {
    const event = { message: 'boom' };

    expect(scrubEvent(event)).toEqual(event);
  });
});
