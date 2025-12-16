import { Hono } from 'hono'
import { renderer } from '../../middlewares/renderer.js'
import { validationMiddleware } from '../../middlewares/request-validator.js'
import { ExpiredLinkPage } from '../../pages/expired.js'
import { IncorrectPasswordPage } from '../../pages/incorrect-password.js'
import { NotFoundPage } from '../../pages/not-found.js'
import { PasswordPage } from '../../pages/password.js'
import { verifyPassword } from '../../utils/password-manager.js'
import { getShortUrlByShortCode } from '../data-access/index.js'
import { getShortUrlByCodeParamsSchema, verifyShortUrlPasswordBodySchema } from '../schema.js'

export const shortUrlRouter = new Hono()

shortUrlRouter.use('*', renderer)

// get short-url link by code
shortUrlRouter.get('/:short_url_code', validationMiddleware(getShortUrlByCodeParamsSchema, 'param'), async (c) => {
  const { short_url_code } = c.req.valid('param')

  // let shortUrlData: IShortUrlSchema | null
  // TODO: add cache to get
  // shortUrlData = redis.get(cache-key)

  const shortUrlData = await getShortUrlByShortCode({ short_url_code })

  if (!shortUrlData) {
    return c.render(<NotFoundPage />)
  }

  if (shortUrlData.expires_at && shortUrlData.expires_at < Date.now()) {
    return c.render(<ExpiredLinkPage />)
  }

  if (shortUrlData.password) {
    return c.render(<PasswordPage short_url_code={short_url_code} />)
  }

  // TODO: before sending response, add data to cache with expiry
  // redis.setnx(cache-key, JSON.stringify(data))

  let targetUrl = shortUrlData.long_url

  // Ensure the URL has a protocol
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl
  }

  return c.redirect(targetUrl, 302)
})

shortUrlRouter.post('/password', validationMiddleware(verifyShortUrlPasswordBodySchema, 'form'), async (c) => {
  const { short_url_code, password } = c.req.valid('form')

  //  let shortUrlData: IShortUrlSchema | null
  // TODO: add cache to get
  // shortUrlData = redis.get(cache-key)

  const shortUrlData = await getShortUrlByShortCode({ short_url_code })

  if (!shortUrlData) {
    return c.render(<NotFoundPage />)
  }

  if (shortUrlData.expires_at && shortUrlData.expires_at < Date.now()) {
    return c.render(<ExpiredLinkPage />)
  }

  let targetUrl = shortUrlData.long_url

  // Ensure the URL has a protocol
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    targetUrl = 'https://' + targetUrl
  }

  // TODO: before sending response, add data to cache with expiry
  // redis.setnx(cache-key, JSON.stringify(data))

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
