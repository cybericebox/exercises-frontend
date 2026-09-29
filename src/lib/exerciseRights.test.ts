import { describe, expect, it } from 'vitest'
import type { ExerciseAccess } from '@/api/exercises/access'
import {
  accessFromRbac, canCreateExercise, defaultOwner, editorPermissions, hasCatalogAccess, infrastructureAllowed,
  isReadOnlyCatalogView, ownerOptions,
} from './exerciseRights'

const ev = (ID: string, CanWrite = true, InfrastructureAllowed = true) => ({ ID, Name: `Event ${ID}`, Tag: ID, CanWrite, InfrastructureAllowed })
const admin: ExerciseAccess = { IsAdmin: true, CanCreateCatalog: true, CanPublish: true, CanDelete: true, CanExport: true, Events: [] }
const manager: ExerciseAccess = { IsAdmin: false, CanCreateCatalog: false, CanPublish: false, CanDelete: false, CanExport: false, Events: [ev('a'), ev('b', false), ev('c', true, false)] }
const viewer: ExerciseAccess = { ...manager, Events: [ev('b', false)] }
const nobody: ExerciseAccess = { ...manager, Events: [] }
const allow = () => true
const deny = () => false

describe('exercise rights', () => {
  it('opens the app for admins and event members only', () => {
    expect(hasCatalogAccess(admin)).toBe(true)
    expect(hasCatalogAccess(viewer)).toBe(true)
    expect(hasCatalogAccess(nobody)).toBe(false)
  })

  it('derives admin rights from RBAC when /access is unavailable', () => {
    expect(accessFromRbac((p) => p === 'exercises.read')).toMatchObject({ IsAdmin: true, CanCreateCatalog: false, Events: [] })
  })

  it('lets admins create in the catalog and managers only in writable events', () => {
    expect(canCreateExercise(admin)).toBe(true)
    expect(canCreateExercise(manager)).toBe(true)
    expect(canCreateExercise(viewer)).toBe(false)
    expect(ownerOptions(manager, 'Catalog').map((o) => o.value)).toEqual(['a', 'c'])
    expect(ownerOptions({ ...admin, Events: [ev('a')] }, 'Catalog').map((o) => o.value)).toEqual(['', 'a'])
  })

  it('picks the requested writable event, else catalog for admins, else the only event', () => {
    expect(defaultOwner(manager, 'c')).toBe('c')
    expect(defaultOwner(manager, 'b')).toBeNull()
    expect(defaultOwner(manager, null)).toBeNull()
    expect(defaultOwner({ ...manager, Events: [ev('a')] }, null)).toBe('a')
    expect(defaultOwner(admin, 'x')).toBe('')
  })

  it('knows whether an owner event allows infrastructure', () => {
    expect(infrastructureAllowed(manager, 'c')).toBe(false)
    expect(infrastructureAllowed(manager, 'a')).toBe(true)
    expect(infrastructureAllowed(manager, null)).toBe(true)
    expect(infrastructureAllowed(admin, 'unknown')).toBe(true)
  })

  it('shows catalog exercises read-only to non-admins', () => {
    expect(isReadOnlyCatalogView(manager, { Scope: 'catalog' })).toBe(true)
    expect(isReadOnlyCatalogView(manager, { Scope: 'event' })).toBe(false)
    expect(isReadOnlyCatalogView(admin, { Scope: 'catalog' })).toBe(false)
    expect(isReadOnlyCatalogView(null, { Scope: 'catalog' })).toBe(false)
  })

  it('uses server permissions, then RBAC', () => {
    const Permissions = { CanRead: true, CanEdit: true, CanPublish: false, CanDelete: false, CanManageAccess: false, CanPropose: true, CanExport: false }
    expect(editorPermissions({ Scope: 'event', Permissions }, manager, deny)).toEqual({
      write: true, publish: false, delete: false, export: false, manageAccess: false, propose: true,
    })
    expect(editorPermissions({ Scope: 'catalog', Permissions: { ...Permissions, CanEdit: true } }, manager, allow).write).toBe(false)
    expect(editorPermissions({ Scope: 'catalog', Permissions: null }, null, allow)).toMatchObject({ write: true, publish: true, manageAccess: true, propose: false })
    expect(editorPermissions(null, manager, deny)).toMatchObject({ write: true, publish: false })
    expect(editorPermissions(null, viewer, allow).write).toBe(false)
  })
})
