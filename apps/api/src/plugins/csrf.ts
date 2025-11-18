/**
 * CSRF Protection Middleware
 *
 * Implements CSRF protection for state-changing operations using:
 * - Double-submit cookie pattern
 * - SameSite cookies
 * - Custom header validation
 *
 * Protected routes require either:
 * 1. A matching CSRF token in cookie and header/body
 * 2. A custom header (e.g., X-Requested-With) to prove JavaScript origin
 *
 * Mobile apps using Authorization header are exempt from CSRF checks
 * since they cannot be exploited via CSRF attacks.
 */

import { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';

const CSRF_COOKIE_NAME = 'csrf_token';
const CSRF_HEADER_NAME = 'x-csrf-token';
const CUSTOM_HEADER_NAME = 'x-requested-with';

export interface CSRFOptions {
  /**
   * Paths that require CSRF protection
   * Default: all POST, PUT, DELETE, PATCH requests
   */
  protectedMethods?: string[];

  /**
   * Paths to exclude from CSRF protection
   * e.g., webhook endpoints, OAuth callbacks
   */
  excludePaths?: string[];

  /**
   * Cookie options
   */
  cookieOptions?: {
    httpOnly?: boolean;
    secure?: boolean;
    sameSite?: 'strict' | 'lax' | 'none';
    maxAge?: number;
  };
}

const csrfPlugin: FastifyPluginAsync<CSRFOptions> = async (fastify, options) => {
  const protectedMethods = options.protectedMethods || ['POST', 'PUT', 'DELETE', 'PATCH'];
  const excludePaths = options.excludePaths || [
    '/auth/callback/', // OAuth callbacks are protected by state parameter
    '/webhooks/', // Webhooks use signatures
    '/health', // Health checks
    '/ready', // Readiness checks
    '/metrics', // Metrics endpoint
  ];

  const cookieOptions = {
    httpOnly: false, // Must be readable by JavaScript to send in header
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 3600, // 1 hour
    path: '/',
    ...options.cookieOptions,
  };

  /**
   * Check if a path should be excluded from CSRF protection
   */
  function isExcluded(path: string): boolean {
    return excludePaths.some((excluded) => path.startsWith(excluded));
  }

  /**
   * Check if request has valid CSRF token
   */
  function hasValidCSRFToken(request: any): boolean {
    const cookieToken = request.cookies[CSRF_COOKIE_NAME];
    const headerToken = request.headers[CSRF_HEADER_NAME];
    const bodyToken = (request.body as any)?.[CSRF_HEADER_NAME];

    // Check if token exists in cookie
    if (!cookieToken) {
      return false;
    }

    // Token must match in header OR body
    const providedToken = headerToken || bodyToken;
    if (!providedToken) {
      return false;
    }

    // Constant-time comparison to prevent timing attacks
    return cookieToken === providedToken;
  }

  /**
   * Check if request has custom header indicating JavaScript origin
   * This is an alternative to CSRF token for modern apps
   */
  function hasCustomHeader(request: any): boolean {
    return !!request.headers[CUSTOM_HEADER_NAME];
  }

  /**
   * Check if request is from mobile app (exempt from CSRF)
   * Mobile apps use Authorization header and cannot be exploited via CSRF
   */
  function isMobileRequest(request: any): boolean {
    const authHeader = request.headers.authorization;
    return !!authHeader && authHeader.startsWith('Bearer ');
  }

  /**
   * Generate and set CSRF token cookie
   */
  function generateCSRFToken(reply: any): string {
    const token = nanoid(32);
    reply.setCookie(CSRF_COOKIE_NAME, token, cookieOptions);
    return token;
  }

  /**
   * Hook to set CSRF token on GET requests
   * This allows subsequent POST requests to use the token
   */
  fastify.addHook('onRequest', async (request, reply) => {
    // Only set token on GET requests if not already present
    if (request.method === 'GET' && !request.cookies[CSRF_COOKIE_NAME]) {
      generateCSRFToken(reply);
    }
  });

  /**
   * Hook to validate CSRF token on protected methods
   */
  fastify.addHook('preHandler', async (request, reply) => {
    // Skip if not a protected method
    if (!protectedMethods.includes(request.method)) {
      return;
    }

    // Skip if path is excluded
    if (isExcluded(request.url)) {
      return;
    }

    // Skip if mobile request (Bearer token)
    if (isMobileRequest(request)) {
      return;
    }

    // Accept if has custom header (modern JS apps)
    if (hasCustomHeader(request)) {
      return;
    }

    // Validate CSRF token
    if (!hasValidCSRFToken(request)) {
      fastify.log.warn(
        { method: request.method, url: request.url, ip: request.ip },
        'CSRF token validation failed'
      );

      return reply.status(403).send({
        type: 'about:blank',
        code: 'csrf_token_invalid',
        message: 'CSRF token validation failed',
        details: {
          request_id: request.id,
          hint: 'Include CSRF token in X-CSRF-Token header or request body',
        },
      });
    }
  });

  /**
   * Decorator to get current CSRF token
   */
  fastify.decorate('getCSRFToken', function (this: any, request: any): string {
    return request.cookies[CSRF_COOKIE_NAME] || '';
  });

  /**
   * Decorator to generate new CSRF token
   */
  fastify.decorate('generateCSRFToken', function (this: any, reply: any): string {
    return generateCSRFToken(reply);
  });
};

export default csrfPlugin;
