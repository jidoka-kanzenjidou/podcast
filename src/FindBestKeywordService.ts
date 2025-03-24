// src/FindBestKeywordService.ts

import axios, { AxiosInstance } from 'axios';

interface FindBestKeywordResponse {
  success: boolean;
  data?: string;
  error?: string;
}

export class FindBestKeywordService {
  private apiClient: AxiosInstance;
  private readonly BASE_URL = 'https://http-erabu-eidos-production-80.schnworks.com';

  constructor() {
    this.apiClient = axios.create({
      baseURL: this.BASE_URL,
      timeout: 10000, // 10 seconds timeout, tweak as needed
      headers: {
        'Content-Type': 'application/json',
        // Add other headers if needed, e.g., Authorization
      },
    });
  }

  /**
   * Finds the best keyword for the given prompt.
   * @param prompt The input text prompt to process.
   * @returns A Promise with the best keyword result.
   */
  async findBestKeyword(prompt: string): Promise<FindBestKeywordResponse> {
    try {
      const response = await this.apiClient.post('/v1/find-best-keyword', { prompt });

      if (response.status === 200 || response.status === 201) {
        console.log('✅ Successfully retrieved best keyword:', response.data);
        return {
          success: true,
          data: response.data,
        };
      } else {
        console.log(response)
        console.warn(`⚠️ Unexpected status code: ${response.status}`);
        return {
          success: false,
          error: `Unexpected response status: ${response.status}`,
        };
      }
    } catch (error: any) {
      console.error('❌ Error in findBestKeyword:', error.message || error);

      return {
        success: false,
        error: error.message || 'Unknown error occurred while fetching best keyword.',
      };
    }
  }
}
