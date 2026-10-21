import { z } from 'zod';

// Apply before constructing any schemas. Avoid even the capability probe's new Function,
// which would generate CSP violations despite Zod catching the exception.
z.config({ jitless: true });
export { z };
