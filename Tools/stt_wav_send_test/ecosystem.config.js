module.exports = {
  apps: [
    {
      name: 'stt-test-web',
      script: 'wav_send_to_stt_AI.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production'
      }
    },
    {
      name: 'stt-dummy-server',
      script: 'dummy_stt_server.js',
      cwd: __dirname,
      watch: false,
      autorestart: true,
      env: {
        NODE_ENV: 'production'
      }
    }
  ]
};
