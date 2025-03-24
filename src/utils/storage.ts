// src/utils/storage.ts
import { minioClient } from '../minio/minioClient.js';
import { config } from '../config.js'
import { randomBytes } from 'crypto';

export class Storage {
    private client = minioClient;
    private bucketName: string;

    constructor() {
        this.bucketName = config.minio.bucketName;
        this.ensureBucketExists();
    }

    /**
     * Ensures the bucket exists, creates it if not.
     */
    private async ensureBucketExists(): Promise<void> {
        try {
            const exists = await this.client.bucketExists(this.bucketName);
            if (!exists) {
                await this.client.makeBucket(this.bucketName, 'us-east-1');
                console.log(`📁 Bucket '${this.bucketName}' created successfully`);
            }
        } catch (error) {
            console.error(`❌ Error ensuring bucket '${this.bucketName}' exists:`, error);
            throw error;
        }
    }

    uploadAudioFile = async (file: Express.Multer.File): Promise<string> => {
        const prefix = randomBytes(3).toString('hex'); // 6 random characters
        const uniqueFileName = `${prefix}-${file.originalname}`;
    
        await this.uploadFile(uniqueFileName, file.path);
        console.log(`File uploaded to MinIO: ${uniqueFileName}`);
        return uniqueFileName;
    }

    /**
     * Uploads a file to MinIO.
     * @param fileName - The name of the file.
     * @param filePath - The local path to the file.
     */
    async uploadFile(fileName: string, filePath: string): Promise<string> {
        try {
            await this.client.fPutObject(this.bucketName, fileName, filePath);
            console.log(`✅ File '${fileName}' uploaded successfully`);

            return fileName;
        } catch (error) {
            console.error(`❌ Error uploading file '${fileName}':`, error);
            throw error;
        }
    }

    /**
     * Downloads a file from MinIO.
     * @param fileName - The name of the file.
     * @param downloadPath - The local path to save the file.
     */
    async downloadFile(fileName: string, downloadPath: string): Promise<void> {
        try {
            await this.client.fGetObject(this.bucketName, fileName, downloadPath);
            console.log(`📥 File '${fileName}' downloaded to '${downloadPath}'`);
        } catch (error) {
            console.error(`❌ Error downloading file '${fileName}':`, error);
            throw error;
        }
    }

    /**
     * Deletes a file from MinIO.
     * @param fileName - The name of the file.
     */
    async deleteFile(fileName: string): Promise<void> {
        try {
            await this.client.removeObject(this.bucketName, fileName);
            console.log(`🗑️ File '${fileName}' deleted successfully`);
        } catch (error) {
            console.error(`❌ Error deleting file '${fileName}':`, error);
            throw error;
        }
    }

    /**
     * Checks if a file exists in MinIO.
     * @param fileName - The name of the file.
     * @returns {Promise<boolean>} - Returns true if the file exists, false otherwise.
     */
    async fileExists(fileName: string): Promise<boolean> {
        try {
            await this.client.statObject(this.bucketName, fileName);
            return true;
        } catch (error: any) {
            if (error.code === 'NotFound') {
                return false;
            }
            console.error(`❌ Error checking file '${fileName}':`, error);
            throw error;
        }
    }
}
