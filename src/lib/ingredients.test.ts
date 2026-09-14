import { describe, expect, it } from 'vitest'
import { cleanIngredientLine, cleanRecipeText, mergeIngredientNames } from './ingredients'
describe('ingredient helpers', () => { it('cleans Arabic quantities and units', () => expect(cleanIngredientLine('٢ كوب أرز طويل')).toBe('أرز طويل')); it('keeps usable recipe lines', () => expect(cleanRecipeText('٢ كوب أرز\n\nنصف كيلو باذنجان')).toEqual(['أرز', 'باذنجان'])); it('merges obvious duplicates', () => expect(mergeIngredientNames(['طماطم', 'طماطم', '٢ حبة بصل'])).toEqual(['طماطم', 'بصل'])) })
