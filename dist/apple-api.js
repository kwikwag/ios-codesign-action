"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AppleApiClient = void 0;
exports.profileTypeForDistributionMethod = profileTypeForDistributionMethod;
const axios_1 = require("axios");
const jsonwebtoken_1 = require("jsonwebtoken");
class AppleApiClient {
    constructor(keyId, issuerId, privateKeyPem) {
        this.keyId = keyId;
        this.issuerId = issuerId;
        this.privateKeyPem = privateKeyPem;
        this.client = axios_1.default.create({
            baseURL: 'https://api.appstoreconnect.apple.com/v1',
            timeout: 60000,
        });
        this.client.interceptors.request.use((config) => {
            config.headers.Authorization = `Bearer ${this.createJwt()}`;
            return config;
        });
    }
    createJwt() {
        const now = Math.floor(Date.now() / 1000);
        return jsonwebtoken_1.default.sign({}, this.privateKeyPem, {
            algorithm: 'ES256',
            issuer: this.issuerId,
            audience: 'appstoreconnect-v1',
            expiresIn: 20 * 60,
            keyid: this.keyId,
            notBefore: now - 5,
        });
    }
    async getBundleIdByIdentifier(identifier) {
        const response = await this.client.get('/bundleIds', {
            params: {
                'filter[identifier]': identifier,
                'filter[platform]': 'IOS',
                limit: 200,
            },
        });
        return response.data.data[0] ?? null;
    }
    async listCertificates() {
        const response = await this.client.get('/certificates', {
            params: {
                'filter[certificateType]': 'DISTRIBUTION',
                limit: 200,
            },
        });
        return response.data.data;
    }
    async listDevices() {
        const response = await this.client.get('/devices', {
            params: {
                'filter[platform]': 'IOS',
                'filter[status]': 'ENABLED',
                limit: 200,
            },
        });
        return response.data.data;
    }
    async listProfilesForBundle(bundleIdId, profileType) {
        const response = await this.client.get('/profiles', {
            params: {
                'filter[bundleId]': bundleIdId,
                'filter[profileType]': profileType,
                limit: 200,
            },
        });
        return response.data.data;
    }
    async deleteProfile(profileId) {
        await this.client.delete(`/profiles/${profileId}`);
    }
    async createProfile(params) {
        const relationships = {
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
        const response = await this.client.post('/profiles', {
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
exports.AppleApiClient = AppleApiClient;
function profileTypeForDistributionMethod(method) {
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
