import { serve } from '@hono/node-server'
import { serveStatic } from '@hono/node-server/serve-static'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { csrf } from 'hono/csrf'
import { requestId } from 'hono/request-id'
import { secureHeaders } from 'hono/secure-headers'
import path from 'node:path'
import v1Router from './api/v1/app.js'
import { requestLogger } from './api/v1/middlewares/request-logger.js'
import { parsedEnv } from './api/v1/utils/env.js'
import logger from './api/v1/utils/logger.js'

const app = new Hono()

// --------------- middlewares ------------
app.use(csrf({ origin: 'http://localhost:3000' }))
app.use(secureHeaders())
app.use(requestId())
app.use(requestLogger())

app.use(
  '*',
  cors({
    origin: 'http://localhost:3000',
    allowHeaders: ['Content-Type', 'Authorization'],
    allowMethods: ['POST', 'GET', 'OPTIONS'],
    exposeHeaders: ['Content-Length'],
    maxAge: 600,
    credentials: true,
  }),
)

// serve static files (before basePath to avoid /api prefix)
app.use(
  '/assets/*',
  serveStatic({
    root: path.resolve(process.cwd(), 'public/assets'),
    rewriteRequestPath: (path) => path.replace(/^\/assets/, ''),
  }),
)

// --------------- routes -----------------
// register v1 app with /api prefix
app.route('/api/v1', v1Router)

// not-found
app.notFound(async (c) => {
  c.status(404)
  return c.json({
    status: 404,
    success: false,
    message: 'The requested resource not found!',
    requestId: c.get('requestId'),
  })
})

serve(
  {
    fetch: app.fetch,
    port: parsedEnv.APP_PORT || 3000,
  },
  (info) => {
    logger.info(`Server is running on http://localhost:${info.port}`)
  },
)
