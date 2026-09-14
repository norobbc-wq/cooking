import { supabase } from './supabase'
import type { Dish, Household, HouseholdMember, Ingredient, MealPlanItem, Profile, ShoppingItem, ShoppingList } from '../types'

function client() { if (!supabase) throw new Error('لم يتم إعداد الاتصال بالخدمة بعد.'); return supabase }
function unwrap<T>({ data, error }: { data: T | null; error: { message: string } | null }) { if (error) throw new Error(error.message); return data as T }

export const api = {
  households: async () => unwrap(await client().from('households').select('*').order('created_at')) as Household[],
  createHousehold: async (name: string) => unwrap(await client().rpc('create_household', { household_name: name }).single()) as Household,
  joinHousehold: async (code: string) => unwrap(await client().rpc('join_household_by_code', { raw_code: code }).single()) as Household,
  deleteAccount: async () => {
    const { error } = await client().functions.invoke('delete-account')
    if (error) throw new Error(error.message)
  },
  members: async (householdId: string) => {
    const db = client()
    const members = unwrap(await db.from('household_members').select('*').eq('household_id', householdId)) as HouseholdMember[]
    if (!members.length) return members
    const profiles = unwrap(await db.from('profiles').select('id, display_name').in('id', members.map((member) => member.user_id))) as Pick<Profile, 'id' | 'display_name'>[]
    const byId = new Map(profiles.map((profile) => [profile.id, profile]))
    return members.map((member) => ({ ...member, profiles: byId.get(member.user_id) ?? null }))
  },
  dishes: async (householdId: string) => unwrap(await client().from('dishes').select('*, ingredients(*)').eq('household_id', householdId).order('created_at')) as Dish[],
  saveDish: async (householdId: string, userId: string, dish: Partial<Dish>, ingredients: Omit<Ingredient, 'id' | 'dish_id' | 'created_at'>[]) => {
    const db = client(); const payload = { name: dish.name?.trim(), description: dish.description?.trim() ?? '', category: dish.category?.trim() ?? '', is_favorite: Boolean(dish.is_favorite), household_id: householdId, created_by: userId }
    const saved = (dish.id ? unwrap(await db.from('dishes').update(payload).eq('id', dish.id).select().single()) : unwrap(await db.from('dishes').insert(payload).select().single())) as unknown as Dish
    await db.from('ingredients').delete().eq('dish_id', saved.id)
    if (ingredients.length) unwrap(await db.from('ingredients').insert(ingredients.map((ingredient, position) => ({ ...ingredient, dish_id: saved.id, position }))))
    return saved
  },
  deleteDish: async (id: string) => { const { error } = await client().from('dishes').delete().eq('id', id); if (error) throw new Error(error.message) },
  shoppingList: async (householdId: string) => unwrap(await client().from('shopping_lists').select('*, shopping_items(*)').eq('household_id', householdId).order('updated_at', { ascending: false }).limit(1).maybeSingle()) as ShoppingList | null,
  createShoppingList: async (householdId: string, userId: string, names: string[]) => {
    const db = client(); const list = unwrap(await db.from('shopping_lists').insert({ household_id: householdId, created_by: userId }).select().single()) as ShoppingList
    if (names.length) unwrap(await db.from('shopping_items').insert(names.map((name) => ({ shopping_list_id: list.id, name }))))
    return list
  },
  addShoppingItem: async (listId: string, name: string) => unwrap(await client().from('shopping_items').insert({ shopping_list_id: listId, name: name.trim() }).select().single()) as ShoppingItem,
  updateShoppingItem: async (id: string, patch: Partial<Pick<ShoppingItem, 'name' | 'checked'>>) => { const { error } = await client().from('shopping_items').update(patch).eq('id', id); if (error) throw new Error(error.message) },
  deleteShoppingItem: async (id: string) => { const { error } = await client().from('shopping_items').delete().eq('id', id); if (error) throw new Error(error.message) },
  resetShoppingList: async (listId: string) => { const { error } = await client().from('shopping_items').update({ checked: false }).eq('shopping_list_id', listId); if (error) throw new Error(error.message) },
  mealPlan: async (householdId: string, from: string, to: string) => unwrap(await client().from('meal_plan').select('*, dishes(id,name,ingredients(*))').eq('household_id', householdId).gte('plan_date', from).lte('plan_date', to)) as MealPlanItem[],
  setPlan: async (householdId: string, userId: string, date: string, dishId: string) => { const { error } = await client().from('meal_plan').upsert({ household_id: householdId, created_by: userId, plan_date: date, dish_id: dishId }, { onConflict: 'household_id,plan_date' }); if (error) throw new Error(error.message) },
  deletePlan: async (id: string) => { const { error } = await client().from('meal_plan').delete().eq('id', id); if (error) throw new Error(error.message) }
}
