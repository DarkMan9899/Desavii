/**
 * Auth module Controller.
 *
 * Implements BACKEND_ARCHITECTURE.md Ch.5: parse input -> build DTO ->
 * call Service -> shape response. The web-client refresh-token cookie
 * (`FRONTEND_ARCHITECTURE.md` §34.1) is set/cleared HERE, never in the
 * Service — delivery mechanics (cookies, headers) are an HTTP/Controller
 * concern; the Service only ever returns plain data.
 *
 * `X-Client: web` is this codebase's convention for "this request came
 * from the browser app" (apps/web is still Sprint-1 scaffold — no
 * concrete header value exists yet to match against, so this is
 * documented here as the value apps/web's Axios instance should send,
 * `FRONTEND_ARCHITECTURE.md` §10.1).
 *
 * Sprint L fix: alongside the httpOnly `refresh_token` cookie, also sets
 * a plain, non-httpOnly, valueless-of-any-secret `session_hint` cookie.
 * `refresh_token` being httpOnly is deliberate (XSS protection,
 * `tokenStore.js`'s own comment) but it also means the frontend's
 * `AuthProvider` bootstrap effect had no way to tell "no session cookie
 * at all" apart from "cookie exists, might be expired" without firing a
 * real `POST /auth/refresh` on every single page load — including a
 * logged-out visitor on a public page, who could never have a session.
 * `session_hint` carries no sensitive value (just presence/absence) so
 * exposing it to JS costs nothing security-wise, and lets the frontend
 * skip that network call entirely when it's absent.
 */

import { decodeToken } from '../../../core/domain/tokenService.js';
import { toAuthResponseDto, toPrincipalDto } from '../dto/authDto.js';

const REFRESH_COOKIE_NAME = 'refresh_token';
const SESSION_HINT_COOKIE_NAME = 'session_hint';

function isWebClient(req) {
  return req.headers['x-client'] === 'web';
}

function buildContext(req) {
  return {
    ipAddress: req.ip,
    userAgent: req.headers['user-agent'],
    deviceLabel: req.headers['x-client'] || req.headers['user-agent'] || null,
    requestId: req.requestId,
  };
}

function setRefreshCookie(req, res, refreshToken) {
  if (!isWebClient(req)) return;
  const { exp } = decodeToken(refreshToken);
  const expires = new Date(exp * 1000);
  res.cookie(REFRESH_COOKIE_NAME, refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: 'strict',
    expires,
  });
  res.cookie(SESSION_HINT_COOKIE_NAME, '1', {
    httpOnly: false,
    secure: true,
    sameSite: 'strict',
    expires,
  });
}

function clearSessionCookies(req, res) {
  if (!isWebClient(req)) return;
  res.clearCookie(REFRESH_COOKIE_NAME);
  res.clearCookie(SESSION_HINT_COOKIE_NAME);
}

function readRefreshToken(req) {
  return req.body?.refresh_token || req.cookies?.[REFRESH_COOKIE_NAME] || null;
}

export function createAuthController(authenticationService) {
  return {
    async register(req, res, next) {
      try {
        const result = await authenticationService.register(
          req.validated.body,
          buildContext(req),
        );
        setRefreshCookie(req, res, result.refreshToken);
        res.status(201).json({
          success: true,
          data: toAuthResponseDto(result),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async login(req, res, next) {
      try {
        const result = await authenticationService.login(
          req.validated.body,
          buildContext(req),
        );
        setRefreshCookie(req, res, result.refreshToken);
        res.status(200).json({
          success: true,
          data: toAuthResponseDto(result),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async refresh(req, res, next) {
      try {
        const refreshToken =
          req.validated.body.refresh_token || readRefreshToken(req);
        const result = await authenticationService.refresh(
          refreshToken,
          buildContext(req),
        );
        setRefreshCookie(req, res, result.refreshToken);
        res.status(200).json({
          success: true,
          data: {
            access_token: result.accessToken,
            refresh_token: result.refreshToken,
          },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async logout(req, res, next) {
      try {
        const refreshToken = readRefreshToken(req);
        const result = await authenticationService.logout(
          refreshToken,
          buildContext(req),
        );
        clearSessionCookies(req, res);
        res
          .status(200)
          .json({ success: true, data: result, meta: null, error: null });
      } catch (err) {
        next(err);
      }
    },

    async logoutAll(req, res, next) {
      try {
        const { revokedCount } = await authenticationService.logoutAll(
          req.principal.userId,
          buildContext(req),
        );
        clearSessionCookies(req, res);
        res.status(200).json({
          success: true,
          data: { revoked_count: revokedCount },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    /**
     * Always 200 with the same body, whether or not `email` matched a
     * real account — see `AuthenticationService#requestPasswordReset`'s
     * own comment. The controller layer is exactly where an
     * account-enumeration leak would otherwise creep back in (e.g. a
     * well-meaning `if (!result.found) return 404` here would defeat the
     * Service's own care), so this stays a flat, unconditional response.
     */
    async requestPasswordReset(req, res, next) {
      try {
        await authenticationService.requestPasswordReset(
          req.validated.body,
          buildContext(req),
        );
        res.status(200).json({
          success: true,
          data: {
            message:
              "If an account exists for that email, we've sent a password reset link.",
          },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async resetPassword(req, res, next) {
      try {
        await authenticationService.resetPassword(
          req.validated.body,
          buildContext(req),
        );
        res.status(200).json({
          success: true,
          data: { reset: true },
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },

    async me(req, res, next) {
      try {
        const result = await authenticationService.getPrincipal(
          req.principal.userId,
        );
        res.status(200).json({
          success: true,
          data: toPrincipalDto(result),
          meta: null,
          error: null,
        });
      } catch (err) {
        next(err);
      }
    },
  };
}

export default createAuthController;
