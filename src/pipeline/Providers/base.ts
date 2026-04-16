/**
 * Common interface for all CloudFrontize origin providers.
 * 
 * @namespace Backend
 * Origin Providers are responsible for the "Origin Fetch" stage of the pipeline.
 * They resolve request URIs to physical assets and stream the results back 
 * while maintaining the correct HTTP metadata.
 */
export interface OriginProvider {
    /**
     * Fetches a resource from the origin.
     * @param req - The current pipeline request object.
     * @param res - The response object to stream data into.
     * @param options - Provider execution options.
     * @param body - Optional request body Buffer (post-L@E mutation).
     */
    fetch(req: any, res: any, options: any, body?: Buffer): Promise<void>;
}
