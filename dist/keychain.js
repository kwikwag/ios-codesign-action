"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAndImportCertificate = createAndImportCertificate;
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const exec = require("@actions/exec");
async function runSecurity(args) {
    let stdout = '';
    await exec.exec('security', args, {
        listeners: {
            stdout: (data) => {
                stdout += data.toString();
            },
        },
        silent: true,
    });
    return stdout;
}
async function createAndImportCertificate(params) {
    const keychainPassword = Math.random().toString(36).slice(2);
    await fs.mkdir(path.dirname(params.keychainPath), { recursive: true });
    await runSecurity(['create-keychain', '-p', keychainPassword, params.keychainPath]);
    await runSecurity(['set-keychain-settings', '-lut', '21600', params.keychainPath]);
    await runSecurity(['unlock-keychain', '-p', keychainPassword, params.keychainPath]);
    const originalList = await runSecurity(['list-keychains', '-d', 'user']);
    const existing = originalList
        .split(/\r?\n/)
        .map((line) => line.replace(/["\s]/g, ''))
        .filter(Boolean);
    const merged = Array.from(new Set([params.keychainPath, ...existing]));
    await runSecurity(['list-keychains', '-d', 'user', '-s', ...merged]);
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ios-codesign-'));
    const p12Path = path.join(tempDir, 'certificate.p12');
    await fs.writeFile(p12Path, Buffer.from(params.p12Base64, 'base64'));
    await runSecurity([
        'import',
        p12Path,
        '-k',
        params.keychainPath,
        '-P',
        params.p12Password,
        '-T',
        '/usr/bin/codesign',
        '-T',
        '/usr/bin/security',
    ]);
    await runSecurity([
        'set-key-partition-list',
        '-S',
        'apple-tool:,apple:,codesign:',
        '-s',
        '-k',
        keychainPassword,
        params.keychainPath,
    ]);
    const serialNumber = await extractSerialNumberFromP12(p12Path, params.p12Password);
    return {
        keychainPath: params.keychainPath,
        certificateSerialNumber: serialNumber,
    };
}
async function extractSerialNumberFromP12(p12Path, p12Password) {
    let certPem = '';
    await exec.exec('openssl', ['pkcs12', '-in', p12Path, '-clcerts', '-nokeys', '-passin', `pass:${p12Password}`], {
        listeners: {
            stdout: (data) => {
                certPem += data.toString();
            },
        },
        silent: true,
    });
    const tempCert = path.join(os.tmpdir(), `ios-codesign-cert-${Date.now()}.pem`);
    await fs.writeFile(tempCert, certPem);
    let serialOutput = '';
    await exec.exec('openssl', ['x509', '-in', tempCert, '-noout', '-serial'], {
        listeners: {
            stdout: (data) => {
                serialOutput += data.toString();
            },
        },
        silent: true,
    });
    const serial = serialOutput.trim().replace(/^serial=/i, '').toUpperCase();
    if (!serial) {
        throw new Error('Failed to extract serial number from distribution certificate.');
    }
    return serial;
}
