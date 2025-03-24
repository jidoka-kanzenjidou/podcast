// src/minio/minioClient.ts
import { Client } from 'minio';
import { config } from '../config.js';

export const minioClient = new Client({
    endPoint: config.minio.endpoint,
    port: config.minio.port,
    useSSL: config.minio.useSSL,
    accessKey: config.minio.accessKey,
    secretKey: config.minio.secretKey,
});