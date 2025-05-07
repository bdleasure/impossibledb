// test/index.spec.ts
import { describe, it, expect, vi } from 'vitest';
import worker from '../src/index';

// Mock Cloudflare test utilities
const env = {
  STORAGE_OBJECT: {
    idFromString: (id: string) => ({ toString: () => id }),
    get: vi.fn().mockReturnValue({
      fetch: vi.fn().mockImplementation(async (req) => {
        return new Response(JSON.stringify({ status: 'ok' }), {
          headers: { 'Content-Type': 'application/json' }
        });
      })
    })
  },
  ENVIRONMENT: 'test'
};

// Mock execution context
const createExecutionContext = (): ExecutionContext => ({
  waitUntil: vi.fn(),
  passThroughOnException: vi.fn(),
  exports: {},
  props: {},
  abort: vi.fn()
});

// Mock wait function
const waitOnExecutionContext = async (ctx: any) => Promise.resolve();

// Mock SELF
const SELF = {
  fetch: vi.fn().mockImplementation(async (url) => {
    return worker.fetch(new Request(url), env, createExecutionContext());
  })
};

// For now, you'll need to do something like this to get a correctly-typed
// `Request` to pass to `worker.fetch()`.
class IncomingRequest extends Request {
  constructor(input: RequestInfo | URL, init?: RequestInit) {
    super(input, init);
  }
}

describe('ImpossibleDB Worker', () => {
	it('responds with welcome page', async () => {
		const request = new IncomingRequest('http://example.com');
		// Create an empty context to pass to `worker.fetch()`.
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		// Wait for all `Promise`s passed to `ctx.waitUntil()` to settle before running test assertions
		await waitOnExecutionContext(ctx);
		expect(await response.text()).toMatchInlineSnapshot(`
    "
            <html>
              <body>
                <h1>ImpossibleDB</h1>
                <p>The Impossibly Fast Global Database Built on Cloudflare Durable Objects</p>
                <p>API is available at /api/data/...</p>
                <p>Version: 0.1.0</p>
                <p>Environment: test</p>
              </body>
            </html>
          "
  `);
	});

	it('responds with health check', async () => {
		const request = new IncomingRequest('http://example.com/health');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		
		const responseBody = await response.json() as Record<string, any>;
		expect(response.status).toBe(200);
		expect(responseBody).toHaveProperty('status', 'ok');
		expect(responseBody).toHaveProperty('version');
		expect(responseBody).toHaveProperty('environment');
		expect(responseBody).toHaveProperty('features');
	});
	
	it('returns 404 for invalid routes', async () => {
		const request = new IncomingRequest('http://example.com/invalid-route');
		const ctx = createExecutionContext();
		const response = await worker.fetch(request, env, ctx);
		await waitOnExecutionContext(ctx);
		
		expect(response.status).toBe(404);
		const responseBody = await response.json() as Record<string, any>;
		expect(responseBody).toHaveProperty('error');
		expect(responseBody.error).toHaveProperty('code');
		expect(responseBody.error).toHaveProperty('message');
	});
});
