/**
 * Header the WebUI API sets on the test requests it sends (POST /api/v2/invoke), so it can find their
 * journey. The server removes it before anything else sees the request; functions never get it.
 */
export const INVOKE_HEADER = 'x-cloudfrontize-invoke';
export const INVOKE_ID = /^[0-9a-f]{8}$/;
