declare module 'cloudflare:test' {
	interface ProvidedEnv extends Env {}
}

// Define ExecutionContext for tests
interface ExecutionContext {
	waitUntil: (promise: Promise<any>) => void;
	passThroughOnException: () => void;
	exports?: any;
	props?: any;
	abort?: () => void;
}
