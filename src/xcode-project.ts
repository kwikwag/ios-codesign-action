import * as path from 'path';
import * as fs from 'fs/promises';
import * as exec from '@actions/exec';
import plist from 'plist';

export type TargetSigningInfo = {
  target: string;
  bundleId: string;
  entitlementsPath?: string;
  capabilities: string[];
};

type BuildSettingsMap = Map<string, string>;

function parseBuildSettings(raw: string): BuildSettingsMap {
  const settings = new Map<string, string>();
  const lines = raw.split(/\r?\n/);

  for (const line of lines) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) {
      continue;
    }
    settings.set(match[1], match[2]);
  }

  return settings;
}

async function loadCapabilities(projectRoot: string, entitlementsPath?: string): Promise<string[]> {
  if (!entitlementsPath) {
    return [];
  }

  const resolvedPath = path.isAbsolute(entitlementsPath)
    ? entitlementsPath
    : path.join(projectRoot, entitlementsPath);

  try {
    const raw = await fs.readFile(resolvedPath, 'utf8');
    const parsed = plist.parse(raw);
    if (!parsed || typeof parsed !== 'object') {
      return [];
    }
    return Object.keys(parsed as Record<string, unknown>).sort();
  } catch {
    return [];
  }
}

export async function discoverTargets(params: {
  projectPath: string;
  scheme: string;
}): Promise<TargetSigningInfo[]> {
  const projectRoot = path.dirname(params.projectPath);
  const workspaceFlag = params.projectPath.endsWith('.xcworkspace') ? '-workspace' : '-project';

  let output = '';
  await exec.exec(
    'xcodebuild',
    [workspaceFlag, params.projectPath, '-scheme', params.scheme, '-showBuildSettings'],
    {
      listeners: {
        stdout: (data) => {
          output += data.toString();
        },
      },
      silent: true,
    },
  );

  const blocks = output.split(/Build settings for action build and target /g).slice(1);
  const byBundleId = new Map<string, TargetSigningInfo>();

  for (const block of blocks) {
    const targetMatch = block.match(/^(.+?):/);
    const target = targetMatch?.[1]?.trim();
    if (!target) {
      continue;
    }

    const settings = parseBuildSettings(block);
    const bundleId = settings.get('PRODUCT_BUNDLE_IDENTIFIER')?.trim();
    if (!bundleId) {
      continue;
    }

    const entitlementsPath = settings.get('CODE_SIGN_ENTITLEMENTS')?.trim();
    const capabilities = await loadCapabilities(projectRoot, entitlementsPath);

    if (!byBundleId.has(bundleId)) {
      byBundleId.set(bundleId, {
        target,
        bundleId,
        entitlementsPath,
        capabilities,
      });
    }
  }

  return Array.from(byBundleId.values());
}
