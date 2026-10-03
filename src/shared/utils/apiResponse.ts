/** Every successful response the API sends has this shape. */
export interface ApiResponse<T> {
  success: true;
  data: T;
  message?: string;
}

/** Every failed response the API sends has this shape. */
export interface ApiErrorResponse {
  success: false;
  code: string;
  message: string;
  details?: unknown;
}

export function successResponse<T>(data: T, message?: string): ApiResponse<T> {
  return message === undefined ? { success: true, data } : { success: true, data, message };
}

export function errorResponse(code: string, message: string, details?: unknown): ApiErrorResponse {
  return details === undefined
    ? { success: false, code, message }
    : { success: false, code, message, details };
}
