import { spawn } from 'node:child_process';
import net from 'node:net';

const previewPort = 4175;

function waitForPort(port, timeoutMs) {
  const started = Date.now();

  return new Promise((resolve, reject) => {
    const tryConnect = () => {
      const socket = net.createConnection({ host: '127.0.0.1', port });
      socket.once('connect', () => {
        socket.destroy();
        resolve();
      });
      socket.once('error', () => {
        socket.destroy();

        if (Date.now() - started > timeoutMs) {
          reject(new Error(`Timed out waiting for port ${port}`));
          return;
        }

        setTimeout(tryConnect, 500);
      });
    };

    tryConnect();
  });
}

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child =
      process.platform === 'win32'
        ? spawn('cmd.exe', ['/d', '/s', '/c', [command, ...args].join(' ')], {
            shell: false,
            stdio: 'inherit',
            windowsHide: true,
            ...options,
          })
        : spawn(command, args, {
            shell: false,
            stdio: 'inherit',
            ...options,
          });

    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(new Error(`${command} exited with code ${code ?? 'null'}`));
    });
  });
}

await runCommand('pnpm', ['build']);

const server =
  process.platform === 'win32'
    ? spawn(
        'cmd.exe',
        ['/d', '/s', '/c', `pnpm --filter @csvshape/web exec vite preview --host 127.0.0.1 --port ${previewPort}`],
        {
          shell: false,
          stdio: 'ignore',
          windowsHide: true,
        },
      )
    : spawn(
        'pnpm',
        ['--filter', '@csvshape/web', 'exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(previewPort)],
        {
          shell: false,
          stdio: 'ignore',
        },
      );

try {
  await waitForPort(previewPort, 60_000);
  await runCommand(
    'pnpm',
    ['--filter', '@csvshape/web', 'privacy:smoke'],
    {
      env: {
        ...process.env,
        CSVSHAPE_BASE_URL: `http://127.0.0.1:${previewPort}`,
      },
    },
  );
} finally {
  server.kill('SIGTERM');
}
