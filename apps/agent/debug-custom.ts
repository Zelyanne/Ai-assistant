import { spawn } from 'child_process';
import { config } from './src/config/index.js';

console.log('--- CUSTOM DEBUG STARTED ---');

const proc = spawn('uv', ['run', '--with', 'workspace-mcp', 'python', 'apps/agent/debug_script.py'], {
    env: {
        ...process.env,
        GOOGLE_OAUTH_CLIENT_ID: config.GOOGLE_OAUTH_CLIENT_ID,
        GOOGLE_OAUTH_CLIENT_SECRET: config.GOOGLE_OAUTH_CLIENT_SECRET,
        OAUTHLIB_INSECURE_TRANSPORT: '1'
    },
    stdio: 'inherit',
    shell: true
});

proc.on('exit', (code) => {
    console.log(`[CUSTOM DEBUG EXIT] Code: ${code}`);
});
