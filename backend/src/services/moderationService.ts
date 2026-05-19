import { logger } from '../logger'
import { unprocessable } from '../http'

const blockedKeywords = [
  '诈骗',
  '涉黄',
  '毒品',
  '赌博',
  '办证',
  '开户',
]

export function moderateContent(kind: 'post' | 'comment', content: string) {
  const normalized = content.trim()
  const lowered = normalized.toLowerCase()

  const blocked = blockedKeywords.find((keyword) => lowered.includes(keyword.toLowerCase()))
  if (blocked) {
    logger.warn('Content blocked by moderation keyword', { kind, keyword: blocked })
    throw unprocessable('内容包含违规词，已被拦截', { kind, keyword: blocked })
  }

  const urlMatches = normalized.match(/https?:\/\/\S+/gi) || []
  if (urlMatches.length > 2) {
    logger.warn('Content blocked by url spam rule', { kind, urlCount: urlMatches.length })
    throw unprocessable('内容疑似广告或刷屏，已被拦截', { kind, rule: 'too_many_urls' })
  }

  if (/(.)\1{11,}/.test(normalized)) {
    logger.warn('Content blocked by repeated character rule', { kind })
    throw unprocessable('内容疑似灌水，已被拦截', { kind, rule: 'repeated_characters' })
  }

  return normalized
}
