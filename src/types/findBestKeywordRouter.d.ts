// src/types/findBestKeywordRouter.types.d.ts

export interface FindBestKeywordJob {
    status: 'processing' | 'completed' | 'failed';
    result: string | null;
    error?: string;
  }
  
  /**
   * GET /v1/find-best-keyword/:id
   */
  export interface GetFindBestKeywordResponseSuccess {
    success: true;
    data: FindBestKeywordJob;
  }
  
  export interface GetFindBestKeywordResponseError {
    success: false;
    error: string; // e.g., 'Job ID not found.'
  }
  
  export type GetFindBestKeywordResponse =
    | GetFindBestKeywordResponseSuccess
    | GetFindBestKeywordResponseError;
  
  /**
   * POST /v1/find-best-keyword/
   */
  export interface PostFindBestKeywordRequestBody {
    prompt: string;
  }
  
  export interface PostFindBestKeywordResponseSuccess {
    success: true;
    jobId: string;
  }
  
  export interface PostFindBestKeywordResponseError {
    success: false;
    error: string; // e.g., 'Prompt is required in the request body.'
  }
  
  export type PostFindBestKeywordResponse =
    | PostFindBestKeywordResponseSuccess
    | PostFindBestKeywordResponseError;
  