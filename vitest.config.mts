import { defineWorkersConfig } from '@cloudflare/vitest-pool-workers/config';

export default defineWorkersConfig({
	test: {
		poolOptions: {
			workers: {
				wrangler: { configPath: './wrangler.toml' },
				isolatedStorage: true,
			},
		},
		coverage: {
			provider: 'v8',
			reporter: ['text', 'json', 'html'],
			exclude: [
				'coverage/**',
				'dist/**',
				'**/node_modules/**',
				'**/*.d.ts',
				'**/*.test.ts',
				'**/*.spec.ts',
				'test/**',
			],
		},
		environmentOptions: {
			bindings: {
				ENVIRONMENT: 'test',
			},
		},
	},
});
