import axios from 'axios';

interface PodcastResponse {
  correlationId: string;
  status?: string;
  audioUrl?: string;
  error?: string;
}

class BilingualPodcastService {
  private apiUrl: string;

  constructor(apiUrl: string) {
    this.apiUrl = apiUrl;
  }

  async createPodcast(prompt: string, language1: string, language2: string): Promise<string> {
    try {
      const response = await axios.post<PodcastResponse>(`${this.apiUrl}/api/podcasts`, {
        prompt,
        languages: [language1, language2],
      });
      
      if (response.data.correlationId) {
        return response.data.correlationId;
      }
      throw new Error('Failed to retrieve correlationId');
    } catch (error) {
      console.error('Error creating podcast:', error);
      throw error;
    }
  }

  async getPodcastStatus(correlationId: string): Promise<PodcastResponse> {
    try {
      const response = await axios.get<PodcastResponse>(`${this.apiUrl}/api/podcasts/${correlationId}`);
      return response.data;
    } catch (error) {
      console.error('Error fetching podcast status:', error);
      throw error;
    }
  }

  async waitForPodcast(correlationId: string, maxRetries = 10, delay = 5000): Promise<string | null> {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      const statusResponse = await this.getPodcastStatus(correlationId);
      
      if (statusResponse.audioUrl) {
        return statusResponse.audioUrl;
      }
      
      if (statusResponse.error) {
        console.error('Podcast generation error:', statusResponse.error);
        return null;
      }
      
      console.log(`Attempt ${attempt + 1}: Podcast not ready yet. Retrying in ${delay / 1000} seconds...`);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    
    console.error('Max retries reached. Podcast not available.');
    return null;
  }
}

export default BilingualPodcastService;
