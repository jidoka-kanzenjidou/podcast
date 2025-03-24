import axios from 'axios';
import { readCache, writeCache } from './utils/cache.js';

interface PodcastContent {
  translated: string;
  original: string;
}

interface PodcastAudioSegment {
  segments: any[];
  original: string;
  translated: string;
  startTime: number;
  endTime: number;
  audioBase64: string;
  query: string;
}

interface PodcastMessage {
  content: PodcastContent[];
  audio: {
    data: string;
    buffer?: Buffer;
    trimmed: PodcastAudioSegment[];
  };
}

interface PodcastChoice {
  message: PodcastMessage;
}

interface PodcastResponse {
  correlationId: string;
  status?: string;
  choices: PodcastChoice[];
  error?: string;
}

class BilingualPodcastService {
  private apiUrl: string;

  constructor(apiUrl: string = 'https://http-bairingaru-okane-production-80.schnworks.com') {
    this.apiUrl = apiUrl;
  }

  async checkHealth(): Promise<boolean> {
    const healthUrl = `${this.apiUrl}/healthz`;
    try {
      const response = await axios.get(healthUrl);
      if (response.status === 200) {
        console.log('✅ BilingualPodcastService is healthy.');
        return true;
      } else {
        console.error(`❌ Health check failed. Status: ${response.status}`);
        return false;
      }
    } catch (error) {
      console.error(`❌ Error checking health: ${(error as Error).message}`);
      return false;
    }
  }

  async createPodcast(prompt: string): Promise<string> {
    try {
      const cacheKey = `podcast_${prompt.replace(/\s+/g, '_')}.json`;
      const cachedCorrelationId = await readCache(cacheKey);
      
      if (cachedCorrelationId) {
        return JSON.parse(cachedCorrelationId);
      }
      
      const response = await axios.post<PodcastResponse>(`${this.apiUrl}/api/podcasts`, { prompt });
      
      if (response.data.correlationId) {
        await writeCache(cacheKey, Buffer.from(JSON.stringify(response.data.correlationId)));
        return response.data.correlationId;
      }
      throw new Error('Failed to retrieve correlationId');
    } catch (error) {
      console.error('Error creating podcast:', error);
      throw error;
    }
  }

  async getPodcastStatus(correlationId: string): Promise<PodcastResponse|null> {
    try {
      const response = await axios.get<PodcastResponse>(`${this.apiUrl}/api/podcasts/${correlationId}`);
      return response.data;
    } catch (error) {
      // console.error('Error fetching podcast status:', error);

      return null;
    }
  }

  async waitForPodcast(correlationId: string, maxRetries = 10, delay = 5000): Promise<PodcastResponse | null> {
    const cacheKey = `podcast_status_${correlationId}.json`;
    const cachedResponse = await readCache(cacheKey);
    
    if (cachedResponse) {
      return JSON.parse(cachedResponse);
    }
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const statusResponse = await this.getPodcastStatus(correlationId);
      
      if (statusResponse?.error) {
        console.error('Podcast generation error:', statusResponse.error);
        return null;
      }
      if (statusResponse?.choices) {
        await writeCache(cacheKey, Buffer.from(JSON.stringify(statusResponse)));
        return statusResponse;
      }
      
      console.log(`Attempt ${attempt + 1}: Podcast not ready yet. Retrying in ${delay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    
    console.error('Max retries reached. Podcast not available.');
    return null;
  }

  async createAndWaitForPodcast(prompt: string, maxRetries = 12 * 30, delay = 5000): Promise<PodcastResponse | null> {
    try {
      const correlationId = await this.createPodcast(prompt);
      return await this.waitForPodcast(correlationId, maxRetries, delay);
    } catch (error) {
      console.error('Error creating and waiting for podcast:', error);
      return null;
    }
  }
}

export default BilingualPodcastService;
