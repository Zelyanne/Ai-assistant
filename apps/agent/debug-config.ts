import { config } from './src/config/index.js';
console.log('--- Configuration Debug ---');
console.log('ENABLE_LANGFUSE_TRACING:', config.ENABLE_LANGFUSE_TRACING);
console.log('LANGFUSE_PUBLIC_KEY:', config.LANGFUSE_PUBLIC_KEY ? 'EXISTS' : 'MISSING');
console.log('LANGFUSE_SECRET_KEY:', config.LANGFUSE_SECRET_KEY ? 'EXISTS' : 'MISSING');
console.log('LANGFUSE_HOST:', config.LANGFUSE_HOST);
console.log('---------------------------');
