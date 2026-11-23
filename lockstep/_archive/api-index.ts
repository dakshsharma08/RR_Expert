/**
 * Vercel serverless entry point.
 *
 * Vercel turns every file in /api into a serverless function. An Express app is
 * itself a `(req, res) => void` request handler, so exporting it as the default
 * export is enough: Vercel calls it for each request.
 *
 * vercel.json rewrites /api/(.*) to this single function, and Vercel keeps the
 * ORIGINAL path in req.url (e.g. /api/plan), so Express routes it normally.
 * Static files (the built SPA in dist/) are served by Vercel's CDN, not by this
 * function. Environment variables come from the Vercel project settings, so no
 * .env loading here.
 */
import { createApp } from '../server/app';

export default createApp();
