/** A unique id for an item in a user-editable config list (action buttons, folders, channels…). */
export function generateConfigId() {
  return `${Date.now()}-${Math.random().toString().slice(2)}`
}
