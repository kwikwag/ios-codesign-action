# ios-codesign-action

A standalone TypeScript GitHub Action that generates and installs iOS provisioning profiles using the App Store Connect API, plus installs a signing certificate into a temporary keychain.

## Features

- Accepts App Store Connect API credentials (`.p8`, key id, issuer id)
- Accepts a base64-encoded distribution certificate (`.p12`) and password
- Discovers bundle identifiers from your Xcode project/workspace + scheme (main target + extension targets)
- Detects entitlement keys from each target's entitlements file and logs them as discovered capabilities
- Creates or renews provisioning profiles for each bundle identifier based on distribution method
- Installs the certificate in a temporary keychain
- Installs generated provisioning profiles to `~/Library/MobileDevice/Provisioning Profiles/`
- Outputs `keychain-path` for cleanup in an `if: always()` step

## Inputs

| Name | Required | Default | Description |
| --- | --- | --- | --- |
| `api-key-id` | ✅ | - | App Store Connect API Key ID |
| `api-key-issuer-id` | ✅ | - | App Store Connect Issuer ID |
| `api-key-p8` | ✅ | - | Contents of the `.p8` private key |
| `certificate-p12-base64` | ✅ | - | Base64-encoded `.p12` certificate |
| `certificate-password` | ✅ | - | Password for the `.p12` |
| `keychain-path` | ❌ | `$RUNNER_TEMP/app-signing.keychain-db` | Where to create keychain |
| `project-path` | ✅ | - | Path to `.xcworkspace` or `.xcodeproj` |
| `scheme` | ✅ | - | Xcode scheme name |
| `distribution-method` | ❌ | `app-store` | `app-store`, `ad-hoc`, or `development` |
| `team-id` | ✅ | - | Apple Team ID |
| `min-profile-validity-days` | ❌ | `7` | Renew profiles expiring within this many days |

## Outputs

| Name | Description |
| --- | --- |
| `keychain-path` | Path to the keychain created by this action |

## Usage

```yaml
- uses: your-org/ios-codesign-action@v1
  with:
    api-key-id: ${{ vars.APP_STORE_CONNECT_API_KEY_ID }}
    api-key-issuer-id: ${{ vars.APP_STORE_CONNECT_ISSUER_ID }}
    api-key-p8: ${{ secrets.APP_STORE_CONNECT_API_KEY_P8 }}
    certificate-p12-base64: ${{ secrets.APPLE_CERTIFICATE_P12_BASE64 }}
    certificate-password: ${{ secrets.APPLE_CERTIFICATE_PASSWORD }}
    project-path: ios/Runner.xcworkspace
    scheme: dev
    team-id: ${{ vars.APPLE_TEAM_ID }}
  id: codesign

- name: Cleanup keychain
  if: always()
  run: security delete-keychain "${{ steps.codesign.outputs.keychain-path }}" 2>/dev/null || true
```

## Development

```bash
npm install
npm run build
```

This compiles TypeScript from `src/` into `dist/` (which should be committed for GitHub Actions runtime usage).
