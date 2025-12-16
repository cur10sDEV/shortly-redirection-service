import { Hono } from 'hono'
import { generateCacheKey, getCache, setCache } from '../../lib/redis.js'
import { renderer } from '../../middlewares/renderer.js'
import { validationMiddleware } from '../../middlewares/request-validator.js'
import { ExpiredLinkPage } from '../../pages/expired.js'
import { IncorrectPasswordPage } from '../../pages/incorrect-password.js'
import { NotFoundPage } from '../../pages/not-found.js'
import { PasswordPage } from '../../pages/password.js'
import { verifyPassword } from '../../utils/password-manager.js'
import { getShortUrlByShortCode } from '../data-access/index.js'
import { getShortUrlByCodeParamsSchema, verifyShortUrlPasswordBodySchema } from '../schema.js'
import type { IShortUrlSchema } from '../types.js'

export const shortUrlRouter = new Hono()

shortUrlRouter.use('*', renderer)

// get short-url link by code
shortUrlRouter.get('/:short_url_code', validationMiddleware(getShortUrlByCodeParamsSchema, 'param'), async (c) => {
  const { short_url_code } = c.req.valid('param')

  let shortUrlData: IShortUrlSchema | null

  // generate cache key
  const cacheKey = generateCacheKey(short_url_code)

  // get cache
  shortUrlData = await getCache<IShortUrlSchema | null>(cacheKey)

  // if not cached request db
  if (!shortUrlData) {
    shortUrlData = await getShortUrlByShortCode({ short_url_code })
  }

  // if not found
  if (!shortUrlData) {
    return c.render(<NotFoundPage />)
  }

  // if expired
  if (shortUrlData.expires_at && shortUrlData.expires_at < Date.now()) {
    return c.render(<ExpiredLinkPage />)
  }

  // if password protected
  if (shortUrlData.password) {
    return c.render(<PasswordPage short_url_code={short_url_code} />)
  }

  // set cache with expiry
  await setCache(cacheKey, shortUrlData, { expiry: 'ONE_DAY' })

  let targetUrl = shortUrlData.long_url

  // Ensure the URL has a protocol
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl
  }

  return c.redirect(targetUrl, 302)
})

shortUrlRouter.post('/password', validationMiddleware(verifyShortUrlPasswordBodySchema, 'form'), async (c) => {
  const { short_url_code, password } = c.req.valid('form')

  let shortUrlData: IShortUrlSchema | null

  // generate cache key
  const cacheKey = generateCacheKey(short_url_code)

  // get cache
  shortUrlData = await getCache<IShortUrlSchema | null>(cacheKey)

  // if not cached request db
  if (!shortUrlData) {
    shortUrlData = await getShortUrlByShortCode({ short_url_code })
  }

  // if not found
  if (!shortUrlData) {
    return c.render(<NotFoundPage />)
  }

  // if expired
  if (shortUrlData.expires_at && shortUrlData.expires_at < Date.now()) {
    return c.render(<ExpiredLinkPage />)
  }

  let targetUrl = shortUrlData.long_url

  // Ensure the URL has a protocol otherwise hono will treat it as a relative path
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl
  }

  // set cache with expiry
  await setCache(cacheKey, shortUrlData, { expiry: 'ONE_DAY' })

  // if password protected
  if (shortUrlData.password) {
    const isPasswordValid = await verifyPassword(password, shortUrlData.password)
    if (isPasswordValid) {
      return c.redirect(targetUrl, 302)
    } else {
      return c.render(<IncorrectPasswordPage />)
    }
  }

  // if no password set
  c.status(400)
  return c.json({
    success: false,
    error: 'Bad Request!',
  })
})
