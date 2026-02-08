import { config } from './src/config/index.js';
import { spawn } from 'child_process';

console.log('--- DEBUGGER STARTED ---');

function run(cmd: string, args: string[], env: any = process.env) {
  console.log(`Running: ${cmd} ${args.join(' ')}`);
  const p = spawn(cmd, args, { 
    env, 
    stdio: 'pipe',
    shell: true // Try shell:true to see if it helps with path resolution
  });

  p.stdout.on('data', d => console.log(`[${cmd} STDOUT] ${d}`));
  p.stderr.on('data', d => console.log(`[${cmd} STDERR] ${d}`));
  p.on('error', e => console.error(`[${cmd} ERROR]`, e));
  p.on('exit', c => console.log(`[${cmd} EXIT] Code: ${c}`));
  return p;
}

// 1. Check Python
run('python', ['--version']);

// 2. Check UV
run('uv', ['--version']);

// 3. Try workspace-mcp help
run('uvx', ['workspace-mcp', '--help']);

// 4. Try the actual server (after a delay to let others finish)
setTimeout(() => {
    console.log('--- STARTING SERVER ATTEMPT (INHERIT STDIO) ---');
    const server = spawn('uvx', ['workspace-mcp', '--transport', 'streamable-http'], {
        env: {
            ...process.env,
            WORKSPACE_MCP_PORT: '8001',
            GOOGLE_OAUTH_CLIENT_ID: config.GOOGLE_OAUTH_CLIENT_ID,
            GOOGLE_OAUTH_CLIENT_SECRET: config.GOOGLE_OAUTH_CLIENT_SECRET,
            MCP_ENABLE_OAUTH21: 'true',
            WORKSPACE_MCP_STATELESS_MODE: 'true',
            EXTERNAL_OAUTH21_PROVIDER: 'true',
            OAUTHLIB_INSECURE_TRANSPORT: '1',
        },
        shell: true,
        stdio: 'inherit' // Inherit to bypass isatty check in safe_print
    });

    // server.stdout.on('data', ...) // Can't listen if inherit
    server.on('exit', c => {
        console.log(`[SERVER EXIT] Code: ${c}`);
        process.exit(c || 0);
    });
}, 5000);
