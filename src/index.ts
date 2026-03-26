import * as core from '@actions/core';
import { AppleApiClient, DistributionMethod, profileTypeForDistributionMethod } from './apple-api';
import { createAndImportCertificate } from './keychain';
import { generateAndInstallProfiles } from './profiles';
import { discoverTargets } from './xcode-project';

function getRequiredInput(name: string): string {
  const value = core.getInput(name, { required: true }).trim();
  if (!value) {
    throw new Error(`Input ${name} is required.`);
  }
  return value;
}

async function run(): Promise<void> {
  try {
    const apiKeyId = getRequiredInput('api-key-id');
    const issuerId = getRequiredInput('api-key-issuer-id');
    const apiKeyP8 = getRequiredInput('api-key-p8');
    const certificateP12Base64 = getRequiredInput('certificate-p12-base64');
    const certificatePassword = getRequiredInput('certificate-password');

    const keychainPath = core.getInput('keychain-path') ||
      `${process.env.RUNNER_TEMP ?? '/tmp'}/app-signing.keychain-db`;
    const projectPath = getRequiredInput('project-path');
    const scheme = getRequiredInput('scheme');
    const distributionMethod = (core.getInput('distribution-method') || 'app-store') as DistributionMethod;
    const teamId = getRequiredInput('team-id');
    const minProfileValidityDays = Number(core.getInput('min-profile-validity-days') || '7');

    if (!['app-store', 'ad-hoc', 'development'].includes(distributionMethod)) {
      throw new Error(`distribution-method must be one of app-store, ad-hoc, development.`);
    }

    const appleClient = new AppleApiClient(apiKeyId, issuerId, apiKeyP8);

    core.info(`Creating temporary keychain at ${keychainPath}`);
    const keychain = await createAndImportCertificate({
      keychainPath,
      p12Base64: certificateP12Base64,
      p12Password: certificatePassword,
    });

    const targets = await discoverTargets({ projectPath, scheme });
    if (targets.length === 0) {
      throw new Error('Could not discover any signable bundle identifiers from xcodebuild settings.');
    }

    core.info(`Discovered ${targets.length} unique bundle identifier(s).`);
    for (const target of targets) {
      core.info(`- ${target.bundleId} (${target.target})`);
    }

    const profileType = profileTypeForDistributionMethod(distributionMethod);

    await generateAndInstallProfiles({
      appleClient,
      targets,
      distributionMethod,
      profileType,
      teamId,
      certificateSerialNumber: keychain.certificateSerialNumber,
      minProfileValidityDays,
    });

    core.setOutput('keychain-path', keychain.keychainPath);
    core.info('iOS code-signing assets installed successfully.');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    core.setFailed(message);
  }
}

void run();
