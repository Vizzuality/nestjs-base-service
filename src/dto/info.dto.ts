export interface InfoDTO<T> {
  params?: Record<string, unknown>;
  authenticatedUser?: T;
  others?: Record<string, unknown>;
}
