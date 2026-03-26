import axios, { AxiosInstance } from 'axios';
import jwt from 'jsonwebtoken';

export type DistributionMethod = 'app-store' | 'ad-hoc' | 'development';

type Resource = {
  id: string;
  type: string;
  attributes?: Record<string, unknown>;
};

type ListResponse<T extends Resource> = {
  data: T[];
};

type SingleResponse<T extends Resource> = {
  data: T;
};

type AppStoreCertificate = Resource & {
  type: 'certificates';
  attributes: {
    certificateType: string;
    displayName?: string;
    name?: string;
    serialNumber?: string;
  };
};

type BundleIdResource = Resource & {
  type: 'bundleIds';
  attributes: {
    identifier: string;
    name: string;
    platform: string;
  };
};

type DeviceResource = Resource & {
  type: 'devices';
  attributes: {
    name?: string;
    udid?: string;
    platform: string;
    status: string;
  };
};

type ProfileResource = Resource & {
  type: 'profiles';
  attributes: {
    name: string;
    profileType: string;
    profileContent?: string;
    expirationDate?: string;
    uuid?: string;
  };
};

export class AppleApiClient {
  private readonly client: AxiosInstance;

  constructor(
    private readonly keyId: string,
    private readonly issuerId: string,
    private readonly privateKeyPem: string,
  ) {
    this.client = axios.create({
      baseURL: 'https://api.appstoreconnect.apple.com/v1',
      timeout: 60000,
    });

    this.client.interceptors.request.use((config) => {
      config.headers.Authorization = `Bearer ${this.createJwt()}`;
      return config;
    });
  }

  private createJwt(): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign({}, this.privateKeyPem, {
      algorithm: 'ES256',
      issuer: this.issuerId,
      audience: 'appstoreconnect-v1',
      expiresIn: 20 * 60,
      keyid: this.keyId,
      notBefore: now - 5,
    });
  }

  async getBundleIdByIdentifier(identifier: string): Promise<BundleIdResource | null> {
    const response = await this.client.get<ListResponse<BundleIdResource>>('/bundleIds', {
      params: {
        'filter[identifier]': identifier,
        'filter[platform]': 'IOS',
        limit: 200,
      },
    });
    return response.data.data[0] ?? null;
  }

  async listCertificates(): Promise<AppStoreCertificate[]> {
    const response = await this.client.get<ListResponse<AppStoreCertificate>>('/certificates', {
      params: {
        'filter[certificateType]': 'DISTRIBUTION',
        limit: 200,
      },
    });
    return response.data.data;
  }

  async listDevices(): Promise<DeviceResource[]> {
    const response = await this.client.get<ListResponse<DeviceResource>>('/devices', {
      params: {
        'filter[platform]': 'IOS',
        'filter[status]': 'ENABLED',
        limit: 200,
      },
    });
    return response.data.data;
  }

  async listProfilesForBundle(bundleIdId: string, profileType: string): Promise<ProfileResource[]> {
    const response = await this.client.get<ListResponse<ProfileResource>>('/profiles', {
      params: {
        'filter[bundleId]': bundleIdId,
        'filter[profileType]': profileType,
        limit: 200,
      },
    });
    return response.data.data;
  }

  async deleteProfile(profileId: string): Promise<void> {
    await this.client.delete(`/profiles/${profileId}`);
  }

  async createProfile(params: {
    name: string;
    profileType: string;
    bundleIdId: string;
    certificateIds: string[];
    deviceIds?: string[];
  }): Promise<ProfileResource> {
    const relationships: Record<string, unknown> = {
      bundleId: { data: { type: 'bundleIds', id: params.bundleIdId } },
      certificates: {
        data: params.certificateIds.map((id) => ({ type: 'certificates', id })),
      },
    };

    if (params.deviceIds && params.deviceIds.length > 0) {
      relationships.devices = {
        data: params.deviceIds.map((id) => ({ type: 'devices', id })),
      };
    }

    const response = await this.client.post<SingleResponse<ProfileResource>>('/profiles', {
      data: {
        type: 'profiles',
        attributes: {
          name: params.name,
          profileType: params.profileType,
        },
        relationships,
      },
    });

    return response.data.data;
  }
}

export function profileTypeForDistributionMethod(method: DistributionMethod): string {
  switch (method) {
    case 'app-store':
      return 'IOS_APP_STORE';
    case 'ad-hoc':
      return 'IOS_APP_ADHOC';
    case 'development':
      return 'IOS_APP_DEVELOPMENT';
    default:
      throw new Error(`Unsupported distribution method: ${method}`);
  }
}
