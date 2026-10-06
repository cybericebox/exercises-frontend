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
