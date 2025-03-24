// src/FindBestKeywordService.ts

import axios, { AxiosInstance } from 'axios';
import type {
  PostFindBestKeywordResponse,
  GetFindBestKeywordResponse,
  FindBestKeywordJob,
  PostFindBestKeywordResponseError,
} from './types/findBestKeywordRouter.d.ts';

export class FindBestKeywordService {
  private apiClient: AxiosInstance;
  private readonly BASE_URL = 'https://http-erabu-eidos-production-80.schnworks.com';

  constructor() {
    this.apiClient = axios.create({
      baseURL: this.BASE_URL,
      timeout: 10000, // 10 seconds timeout
      headers: {
        'Content-Type': 'application/json',
        // Add Authorization header here if required
      },
    });
  }

  /**
   * Starts a new find-best-keyword job with the given prompt.
   * @param prompt The prompt for which you want to find the best keyword.
   * @returns A Promise containing the job creation response, including the jobId.
   */
  async startFindBestKeywordJob(prompt: string): Promise<PostFindBestKeywordResponse> {
    try {
      const response = await this.apiClient.post<PostFindBestKeywordResponse>('/v1/find-best-keyword', { prompt });

      if (response.status === 200 || response.status === 201 || response.status === 202) {
        console.log('✅ Job started successfully:', response.data);
        return response.data;
      } else {
        console.warn(`⚠️ Unexpected response status: ${response.status}`);
        return {
          success: false,
          error: `Unexpected response status: ${response.status}`,
        };
      }
    } catch (error: any) {
      console.error('❌ Error starting find-best-keyword job:', error.message || error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred while starting the job.',
      };
    }
  }

  /**
   * Retrieves the status and result of a find-best-keyword job by jobId.
   * @param jobId The ID of the job you want to retrieve.
   * @returns A Promise containing the job status and result.
   */
  async getFindBestKeywordJob(jobId: string): Promise<GetFindBestKeywordResponse> {
    try {
      const response = await this.apiClient.get<GetFindBestKeywordResponse>(`/v1/find-best-keyword/${jobId}`);

      if (response.status === 200) {
        console.log(`✅ Retrieved job [${jobId}] status/result:`, response.data);
        return response.data;
      } else if (response.status === 404) {
        console.warn(`⚠️ Job ID [${jobId}] not found.`);
        return {
          success: false,
          error: 'Job ID not found.',
        };
      } else {
        console.warn(`⚠️ Unexpected response status: ${response.status}`);
        return {
          success: false,
          error: `Unexpected response status: ${response.status}`,
        };
      }
    } catch (error: any) {
      console.error(`❌ Error retrieving job [${jobId}]:`, error.message || error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred while retrieving the job.',
      };
    }
  }

  /**
   * Polls the status of a find-best-keyword job until it is complete or a timeout is reached.
   * @param jobId The ID of the job you want to poll.
   * @param interval Time between polls in milliseconds (default: 3000ms)
   * @param timeout Maximum time to poll in milliseconds (default: 60000ms)
   * @returns A Promise containing the final job result or an error if it times out or fails.
   */
  async pollFindBestKeywordJob(
    jobId: string,
    interval: number = 3000,
    timeout: number = 60000
  ): Promise<string> {
    const startTime = Date.now();

    const poll = async (resolve: Function, reject: Function) => {
      const elapsedTime = Date.now() - startTime;

      if (elapsedTime >= timeout) {
        return reject({
          success: false,
          error: `Polling timed out after ${timeout}ms`,
        });
      }

      try {
        const result = await this.getFindBestKeywordJob(jobId);

        if (!result.success) {
          return reject(result);
        }

        const jobData: FindBestKeywordJob = result.data;
        console.log(`🔄 Polling job [${jobId}] status: ${jobData.status}`);

        if (jobData.status === 'completed') {
          return resolve(jobData.result);
        } else if (jobData.status === 'failed') {
          return reject({
            success: false,
            error: jobData.error || 'Job failed.',
          });
        } else {
          setTimeout(() => poll(resolve, reject), interval);
        }
      } catch (error: any) {
        return reject({
          success: false,
          error: error.message || 'Unknown error occurred during polling.',
        });
      }
    };

    return new Promise(poll);
  }

  /**
   * Runs the full find-best-keyword job process: starts the job and polls until it completes.
   * @param prompt The prompt for which you want to find the best keyword.
   * @param interval Time between polls in milliseconds (default: 3000ms)
   * @param timeout Maximum time to poll in milliseconds (default: 60000ms)
   * @returns A Promise containing the final job result or an error.
   */
  async runFindBestKeyword(
    prompt: string,
    interval: number = 3000,
    timeout: number = 60000
  ): Promise<string> {
    try {
      const startResponse = await this.startFindBestKeywordJob(prompt);

      if (!startResponse.success || !startResponse.jobId) {
        throw new Error((startResponse as PostFindBestKeywordResponseError).error || 'Failed to start the job.');
      }

      const jobId = startResponse.jobId;
      console.log(`🚀 Started job [${jobId}], now polling...`);

      return await this.pollFindBestKeywordJob(jobId, interval, timeout);
    } catch (error: any) {
      console.error('❌ Error running find-best-keyword job:', error.message || error);
      throw new Error(error.message || 'Unknown error occurred while running the job.');
    }
  }
}