const SftpClient = require('ssh2-sftp-client');
const credentials = require('./credentials');

async function withSftp(work) {
  const client = new SftpClient('vera-photos');
  try {
    await client.connect({
      host: credentials.sftp.host,
      port: credentials.sftp.port,
      username: credentials.sftp.username,
      password: credentials.sftp.password,
      readyTimeout: 15000
    });
    return await work(client);
  } finally {
    await client.end().catch(() => {});
  }
}

function remoteFilePath(filename) {
  return `${credentials.sftp.remotePath.replace(/\/$/, '')}/${filename}`;
}

function publicImageUrl(filename) {
  return `${credentials.sftp.publicBaseUrl.replace(/\/$/, '')}/${filename}`;
}

module.exports = { withSftp, remoteFilePath, publicImageUrl };
