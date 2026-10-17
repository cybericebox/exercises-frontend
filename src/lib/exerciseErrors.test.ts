/**
 * exerciseErrors.test.ts — FullCode → i18n key dictionary.
 * t is mocked as "key → key" so we can check the key choice specifically.
 */
import { describe, it, expect, vi } from 'vitest'

vi.mock("@/i18n/t", () => ({ t: (key: string, vars?: Record<string, string | number>) => vars ? `${key} ${Object.values(vars).join(" ")}` : key }))

import { ApiError } from '@/api/client'
import {
  exerciseErrorCode,
  exerciseErrorMessage,
  ERR_EXERCISE_EXISTS,
  ERR_EXERCISE_MODIFIED,
  ERR_NO_DRAFT,
  ERR_DRAFT_ALREADY_EXISTS,
  ERR_EXERCISE_ARCHIVED,
  ERR_EXERCISE_IN_USE,
  archiveErrorDetail,
  ARCHIVE_CONTENT_ERROR_CODES,
} from './exerciseErrors'

function apiError(status: number, code: number, message: string): ApiError {
  return new ApiError(status, { Status: { Code: code, Message: message } }, message)
}

describe('exerciseErrorCode', () => {
  it('extracts the FullCode from the envelope body', () => {
    expect(exerciseErrorCode(apiError(409, 70904, 'modified'))).toBe(70904)
  })
  it('returns null for non-ApiError values', () => {
    expect(exerciseErrorCode(new Error('boom'))).toBeNull()
  })
})

describe('exerciseErrorMessage', () => {
  it('maps known domain codes to i18n keys', () => {
    expect(exerciseErrorMessage(apiError(409, ERR_EXERCISE_MODIFIED, 'x'))).toBe('admin.ex.err.modified')
    expect(exerciseErrorMessage(apiError(409, ERR_EXERCISE_EXISTS, 'x'))).toBe('admin.ex.err.exists')
    expect(exerciseErrorMessage(apiError(409, ERR_NO_DRAFT, 'x'))).toBe('admin.ex.err.noDraft')
    expect(exerciseErrorMessage(apiError(409, ERR_DRAFT_ALREADY_EXISTS, 'x'))).toBe('admin.ex.err.draftExists')
    expect(exerciseErrorMessage(apiError(400, 20912, 'x'))).toBe('admin.ex.err.taskCountMismatch')
    expect(exerciseErrorMessage(apiError(400, 21002, 'x'))).toBe('admin.ex.err.fileTooLarge')
  })

  it('falls back to generic + backend Status.Message for unknown codes', () => {
    expect(exerciseErrorMessage(apiError(500, 42, 'weird backend fact')))
      .toBe('admin.ex.err.genericWith weird backend fact')
  })

  it('falls back to plain generic for non-ApiError', () => {
    expect(exerciseErrorMessage(new TypeError('offline'))).toBe('admin.ex.err.generic')
  })
})

describe('archive and usage conflicts', () => {
  it('maps the archived and in-use conflicts to their own messages', () => {
    expect(exerciseErrorMessage(apiError(409, ERR_EXERCISE_ARCHIVED, 'archived'))).toBe('admin.ex.err.archived')
    expect(exerciseErrorMessage(apiError(409, ERR_EXERCISE_IN_USE, 'in use'))).toBe('admin.ex.err.inUse')
  })
})

describe('W4 error codes', () => {
  it.each([
    [20950, 'exercises.err.hintsInvalid'],
    [20951, 'exercises.err.hintTextRequired'],
    [70952, 'exercises.err.infrastructureNotAllowed'],
    [20953, 'exercises.err.accessInvalid'],
    [30954, 'exercises.err.proposalNotFound'],
    [70955, 'exercises.err.proposalInvalid'],
    [70956, 'exercises.err.proposalDecided'],
    [60957, 'exercises.err.forbidden'],
  ])('maps %i', (code, key) => {
    expect(exerciseErrorMessage(new ApiError(409, { Status: { Code: code, Message: 'x' } }))).toBe(key)
  })
})

describe('task description and catalog fallback', () => {
  it('maps the publish-time task description code', () => {
    expect(exerciseErrorMessage(new ApiError(400, { Status: { Code: 20938, Message: 'x' } }, 'x', undefined, 20938))).toBe('admin.ex.err.taskDescriptionRequired')
  })

  it('uses the catalog text for a code without a key', () => {
    expect(exerciseErrorMessage(new ApiError(400, { Status: { Code: 20934, Message: 'x' } }, 'x', undefined, 20934))).toContain('пресет')
  })

  it('answers a 429 with the wait message, whatever the body', () => {
    expect(exerciseErrorMessage(new ApiError(429, '', undefined, undefined, undefined, 7))).toBe('error.tooManyRequests.wait 7')
    expect(exerciseErrorMessage(new ApiError(429, { Status: { Code: 70428, Message: 'x' } }, 'x', undefined, 70428))).toBe('error.tooManyRequests')
  })
})

describe('static test conflict', () => {
  it('maps the static-test lab-only refusal to its own message', () => {
    expect(exerciseErrorMessage(apiError(409, 70977, 'static'))).toBe('admin.ex.err.testDeployStatic')
  })
})

describe('archiveErrorDetail', () => {
  function withContext(context: Record<string, string>): ApiError {
    return new ApiError(422, { Status: { Code: 20987, Message: 'bad link', Context: context } }, 'bad link')
  }
  it('names a linked variant and its base through i18n', () => {
    expect(archiveErrorDetail(withContext({ variant: '2', linked_to: '1' }))).toBe('admin.exImport.errLinkedVariant 2 1')
  })
  it('names a plain variant as is', () => {
    expect(archiveErrorDetail(withContext({ variant: '2' }))).toBe('2')
  })
})

describe('archiveErrorDetail image reasons', () => {
  function image(code: number, context: Record<string, string>): ApiError {
    return new ApiError(409, { Status: { Code: code, Message: 'm', Context: context } }, 'm')
  }
  it('translates the reason an image file was refused for', () => {
    expect(archiveErrorDetail(image(22829, { file: 'images/web.tar', reason: 'no_amd64' }))).toBe('images/web.tar, admin.exImport.imageReason.no_amd64')
  })
  it('translates a registry reason of an export', () => {
    expect(archiveErrorDetail(image(72830, { device: 'web', reason: 'unreachable' }))).toBe('web, exercises.image.reason.unreachable')
  })
  it('keeps an unknown reason as it is', () => {
    expect(archiveErrorDetail(image(22829, { reason: 'zzz' }))).toBe('zzz')
  })
})

describe('image archive error codes', () => {
  it('shows an unreadable image file under the archive field', () => {
    expect(ARCHIVE_CONTENT_ERROR_CODES.has(22829)).toBe(true)
  })
})
