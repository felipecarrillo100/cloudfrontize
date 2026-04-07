/**
 * AWS Success Database & Navigation Hub
 * This file centralizes all "Foreign" metadata for CloudFront production deployment.
 * It contains Console gateways, Developer documentation, and Architecture guides.
 */

export const AWS_LINKS = {
  /**
   * Production Management Console
   */
  CONSOLE: {
    DISTRIBUTIONS: 'https://console.aws.amazon.com/cloudfront/v3/home#/distributions',
    CFF: 'https://console.aws.amazon.com/cloudfront/v3/home#/functions',
    LAMBDA: 'https://console.aws.amazon.com/lambda/home#/functions',
  },

  /**
   * Comprehensive Developer Documentation Index
   */
  DOCS: {
    // Core Configuration
    HEADERS: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-cloudfront-headers.html',
    COOKIES: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/Cookies.html',
    QUERIES: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/QueryStringParameters.html',
    
    // Logic & Performance
    POLICIES_MANAGED: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-managed-cache-policies.html',
    EVENT_STRUCTURE: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-event-structure.html',
    
    // Restrictions & Sandboxes
    LIMITS_CFF: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-functions-limits.html',
    CFF_READONLY_HEADERS: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/functions-header-manipulation.html#functions-read-only-headers',
    
    // Security & Infrastructure
    WAF_INTEGRATION: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/cloudfront-waf.html',
    GEOLOCATION: 'https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/using-cloudfront-headers.html#cloudfront-headers-viewer-location'
  }
};
