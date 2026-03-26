"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateAndInstallProfiles = generateAndInstallProfiles;
const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const core = require("@actions/core");
const exec = require("@actions/exec");
function normalizeSerial(serial) {
    return serial.replace(/^0+/, '').toUpperCase();
}
function profileNeedsRenewal(expirationDateRaw, minValidityDays) {
    if (!expirationDateRaw || typeof expirationDateRaw !== 'string') {
        return true;
    }
    const expirationDate = new Date(expirationDateRaw);
    const threshold = new Date(Date.now() + minValidityDays * 24 * 60 * 60 * 1000);
    return expirationDate <= threshold;
}
async function parseProvisioningProfileUuid(profilePath) {
    let xml = '';
    await exec.exec('security', ['cms', '-D', '-i', profilePath], {
        listeners: {
            stdout: (data) => {
                xml += data.toString();
            },
        },
        silent: true,
    });
    const match = xml.match(/<key>UUID<\/key>\s*<string>([^<]+)<\/string>/);
    return match?.[1] ?? null;
}
async function generateAndInstallProfiles(params) {
    const certificates = await params.appleClient.listCertificates();
    const normalizedWantedSerial = normalizeSerial(params.certificateSerialNumber);
    const certificate = certificates.find((candidate) => {
        const serial = candidate.attributes?.serialNumber;
        if (!serial || typeof serial !== 'string') {
            return false;
        }
        return normalizeSerial(serial) === normalizedWantedSerial;
    });
    if (!certificate) {
        throw new Error(`Could not find distribution certificate in App Store Connect with serial ${params.certificateSerialNumber}.`);
    }
    const devices = params.distributionMethod === 'app-store' ? [] : await params.appleClient.listDevices();
    await fs.mkdir(path.join(os.homedir(), 'Library/MobileDevice/Provisioning Profiles'), {
        recursive: true,
    });
    for (const target of params.targets) {
        core.info(`Ensuring provisioning profile for ${target.bundleId} (${target.target})`);
        if (target.capabilities.length > 0) {
            core.info(`Detected entitlements/capabilities: ${target.capabilities.join(', ')}`);
        }
        const bundleId = await params.appleClient.getBundleIdByIdentifier(target.bundleId);
        if (!bundleId) {
            throw new Error(`Bundle identifier ${target.bundleId} not found in Apple Developer account.`);
        }
        const existingProfiles = await params.appleClient.listProfilesForBundle(bundleId.id, params.profileType);
        for (const profile of existingProfiles) {
            if (profileNeedsRenewal(profile.attributes?.expirationDate, params.minProfileValidityDays)) {
                core.info(`Deleting stale/expiring profile ${profile.attributes?.name ?? profile.id}`);
                await params.appleClient.deleteProfile(profile.id);
            }
        }
        const profileName = `${target.bundleId} ${params.distributionMethod} ${new Date()
            .toISOString()
            .slice(0, 10)}`;
        const createdProfile = await params.appleClient.createProfile({
            name: profileName,
            profileType: params.profileType,
            bundleIdId: bundleId.id,
            certificateIds: [certificate.id],
            deviceIds: devices.map((device) => device.id),
        });
        const profileBase64 = createdProfile.attributes?.profileContent;
        if (!profileBase64 || typeof profileBase64 !== 'string') {
            throw new Error(`Apple API did not return profile content for ${target.bundleId}.`);
        }
        const tempProfilePath = path.join(os.tmpdir(), `${target.bundleId}.mobileprovision`);
        await fs.writeFile(tempProfilePath, Buffer.from(profileBase64, 'base64'));
        const uuid = (await parseProvisioningProfileUuid(tempProfilePath)) ?? createdProfile.attributes?.uuid;
        if (!uuid || typeof uuid !== 'string') {
            throw new Error(`Unable to determine profile UUID for ${target.bundleId}.`);
        }
        const installPath = path.join(os.homedir(), 'Library/MobileDevice/Provisioning Profiles', `${uuid}.mobileprovision`);
        await fs.copyFile(tempProfilePath, installPath);
        core.info(`Installed profile for ${target.bundleId} at ${installPath}`);
    }
}
