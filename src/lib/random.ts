import type { Dish } from '../types'
export function pickRandomDish(dishes: Dish[], excludedIds: string[] = []) {
  const candidates = dishes.filter((dish) => !excludedIds.includes(dish.id))
  return candidates.length ? candidates[Math.floor(Math.random() * candidates.length)] : undefined
}
