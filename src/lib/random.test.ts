import { describe, expect, it, vi } from 'vitest'
import { pickRandomDish } from './random'
const dish = (id: string) => ({ id, household_id: 'h', name: id, description: '', category: '', is_favorite: false, created_by: 'u', created_at: '', updated_at: '', ingredients: [] })
describe('pickRandomDish', () => { it('never returns an excluded dish', () => { vi.spyOn(Math, 'random').mockReturnValue(0); expect(pickRandomDish([dish('a'), dish('b')], ['a'])?.id).toBe('b') }); it('returns undefined for no candidates', () => expect(pickRandomDish([], [])).toBeUndefined()) })
